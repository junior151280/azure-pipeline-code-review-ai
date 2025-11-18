import * as tl from "azure-pipelines-task-lib/task";
import { deleteExistingComments } from './pr';
import { reviewFile } from './review';
import { InputValidator } from './validation';
import { Repository } from './repository';
import { ParallelProcessor } from './parallel-processor';

async function run() {
  try {
    if (tl.getVariable('Build.Reason') !== 'PullRequest') {
      tl.setResult(tl.TaskResult.Skipped, "This task should only run when the build is triggered by a pull request.");
      return;
    }

    // Retrieve inputs
    const apiKey = tl.getInput('api_key', true);
    const aoiEndpoint = tl.getInput('aoi_endpoint', true);
    const tokenMaxInput = tl.getInput('aoi_tokenMax', true);
    const temperatureInput = tl.getInput('aoi_temperature', true);
    const additionalPromptsInput = tl.getInput('additional_prompts', false);
    const fileExtensions = tl.getInput('file_extensions', false);
    const filesToExclude = tl.getInput('file_excludes', false);
    const openaiModel = tl.getInput('model');

    // Validate inputs
    const apiKeyValidation = InputValidator.validateApiKey(apiKey);
    if (!apiKeyValidation.isValid) {
      tl.setResult(tl.TaskResult.Failed, apiKeyValidation.errors.join(', '));
      return;
    }

    const endpointValidation = InputValidator.validateEndpoint(aoiEndpoint);
    if (!endpointValidation.isValid) {
      tl.setResult(tl.TaskResult.Failed, endpointValidation.errors.join(', '));
      return;
    }

    const temperatureValidation = InputValidator.validateTemperature(temperatureInput);
    if (temperatureValidation.errors.length > 0) {
      temperatureValidation.errors.forEach(err => console.log(`Warning: ${err}`));
    }
    const temperature = temperatureValidation.value;

    const maxTokensValidation = InputValidator.validateMaxTokens(tokenMaxInput);
    if (maxTokensValidation.errors.length > 0) {
      maxTokensValidation.errors.forEach(err => console.log(`Warning: ${err}`));
    }
    const maxTokens = maxTokensValidation.value;

    const model = InputValidator.validateModel(openaiModel);
    console.log(`Using model: ${model}`);

    const additionalPrompts = additionalPromptsInput 
      ? additionalPromptsInput.split(',').map(p => p.trim()).filter(p => p.length > 0)
      : [];

    // Get performance configuration
    const maxConcurrencyInput = tl.getInput('max_concurrency', false) || '3';
    const maxConcurrency = Math.max(1, Math.min(10, parseInt(maxConcurrencyInput, 10) || 3));
    
    const maxRetriesInput = tl.getInput('max_retries', false) || '3';
    const maxRetries = Math.max(0, Math.min(5, parseInt(maxRetriesInput, 10) || 3));

    console.log(`Performance settings: concurrency=${maxConcurrency}, retries=${maxRetries}`);

    // Initialize repository and parallel processor
    const repository = new Repository();
    const parallelProcessor = new ParallelProcessor({ 
      maxConcurrency,
      continueOnError: true 
    });

    // Delete existing comments
    await deleteExistingComments();

    console.log('Starting Code Review');

    // Get files to review
    const filesToReview = await repository.GetChangedFiles(fileExtensions, filesToExclude);
    if (filesToReview.length === 0) {
      console.log('No reviewable code found. Please review the task input parameters.');
      tl.setResult(tl.TaskResult.SucceededWithIssues, "No reviewable code found. Please review the task input parameters.");
      return;
    }

    console.log(`Detected changes in ${filesToReview.length} file(s)`);

    // Track overall usage
    let totalCompletionTokens = 0;
    let totalPromptTokens = 0;
    let totalTokens = 0;
    let filesWithComments = 0;

    // Review files using parallel processor
    const batchResult = await parallelProcessor.processInParallel(
      filesToReview,
      async (fileToReview: string) => {
        const diff = await repository.GetDiff(fileToReview);

        const result = await reviewFile(
          diff, 
          fileToReview, 
          apiKey!, 
          aoiEndpoint!, 
          model,
          maxTokens, 
          temperature, 
          additionalPrompts,
          { maxRetries }
        );

        console.log(`Review completed for file: ${fileToReview}`);
        console.log(`Token Usage - Completion: ${result.usage.completionTokens}, Prompt: ${result.usage.promptTokens}, Total: ${result.usage.totalTokens}`);
        console.log('----------------------------------');

        return result;
      },
      (file) => file
    );

    // Aggregate results from parallel processing
    for (const processResult of batchResult.results) {
      if (processResult.success && processResult.data) {
        totalCompletionTokens += processResult.data.usage.completionTokens;
        totalPromptTokens += processResult.data.usage.promptTokens;
        totalTokens += processResult.data.usage.totalTokens;

        if (processResult.data.hasComments) {
          filesWithComments++;
        }
      } else if (!processResult.success) {
        console.error(`Failed to review file ${processResult.item}: ${processResult.error?.message || 'Unknown error'}`);
      }
    }

    // Summary
    console.log('=================================');
    console.log('Code Review Summary');
    console.log(`Files reviewed: ${filesToReview.length}`);
    console.log(`Files with comments: ${filesWithComments}`);
    console.log(`Total tokens used: ${totalTokens} (Completion: ${totalCompletionTokens}, Prompt: ${totalPromptTokens})`);
    console.log('=================================');

    console.log("Pull Request review task completed.");
  }
  catch (err: any) {
    console.log("Error encountered:", err.message);
    console.log(tl.TaskResult.Failed, err.message);
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();