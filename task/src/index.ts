import * as tl from "azure-pipelines-task-lib/task";
import { Configuration, OpenAIApi } from 'openai';
import { deleteExistingComments } from './pr';
import { reviewFile } from './review';
import { consumeApi } from './review';
import { getTargetBranchName } from './utils';
import { getChangedFiles } from './git';
import * as https from 'https';
import * as http from 'http';
import { Repository } from './repository';
import minimatch from 'minimatch';

async function run() {
  try {
    if (tl.getVariable('Build.Reason') !== 'PullRequest') {
      tl.setResult(tl.TaskResult.Skipped, "This task should only run when the build is triggered by a pull request.");
      return;
    }

    const _repository = new Repository();
    const pr_1 = require("./pr");
    const reviewTs = require("./review");
    const supportSelfSignedCertificate = tl.getBoolInput('support_self_signed_certificate');
    const apiKey = tl.getInput('api_key', true);
    const aoiEndpoint = tl.getInput('aoi_endpoint', true);
    const tokenMax = tl.getInput('aoi_tokenMax', true);
    const temperature = tl.getInput('aoi_temperature', true);
    const additionalPrompts = tl.getInput('additional_prompts', false)?.split(',')
    const fileExtensions = tl.getInput('file_extensions', false);
    const filesToExclude = tl.getInput('file_excludes', false);
    const openaiModel = tl.getInput('model') || 'gpt-4-32k';
    const useHttps = tl.getBoolInput('use_https', true);

    if (apiKey == undefined) {
      tl.setResult(tl.TaskResult.Failed, 'No API Key provided!');
      return;
    }

    if (aoiEndpoint == undefined) {
      tl.setResult(tl.TaskResult.Failed, 'No Azure OpenAI Endpoint provided!');
      return;
    }
    
    let Agent: http.Agent | https.Agent;

    if(useHttps) {
      Agent = new https.Agent({rejectUnauthorized: !supportSelfSignedCertificate});
    }
    else
    {
      Agent = new http.Agent();
    }

    let targetBranch = getTargetBranchName();

    if (!targetBranch) {
      tl.setResult(tl.TaskResult.Failed, 'No target branch found!');
      return;
    }

    await deleteExistingComments(Agent);

    console.log('Starting Code Review');

    let filesToReview = await _repository.GetChangedFiles(fileExtensions, filesToExclude);
    if (filesToReview.length === 0 || filesToReview.length == 0) {
      console.log(`No reviewable code found. Please review the task input parameters.`);
      tl.setResult(tl.TaskResult.SucceededWithIssues, "No reviewable code found. Please review the task input parameters.");
      return
    }

    console.log(`Detected changes in ${filesToReview.length} file(s)`);

    for (let index = 0; index < filesToReview.length; index++) {

      const fileToReview = filesToReview[index];
      let diff = await _repository.GetDiff(fileToReview);
      // TODO: Extract model name from endpoint and replace with openaiModel parameter
      // let endpoint = aoiEndpoint.replace(aoiEndpoint.match(/gpt[^/]+/)[0], openaiModel);

      let review = await reviewFile(diff, fileToReview, Agent, apiKey, aoiEndpoint, tokenMax, temperature, additionalPrompts)

      if (diff.indexOf('NO_COMMENT') < 0) {
        await pr_1.addCommentToPR(fileToReview, review, Agent);
      }

      console.log(`Review completed for file: ${fileToReview}`)
      console.log(`----------------------------------`)
      console.log(`Token Usage: ${consumeApi}`)
      console.log(`----------------------------------`)
    }

    console.log("Pull Request review task completed.");
  }
  catch (err: any) {
    console.log("Error encountered:", err.message);
    console.log(tl.TaskResult.Failed, err.message);
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();