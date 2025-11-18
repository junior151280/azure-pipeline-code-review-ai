import fetch from 'node-fetch';
import { git } from './git';
import { addCommentToPR } from './pr';
import * as https from 'https';
import * as http from 'http';


export let consumeApi : string;
export async function reviewFile(gitDiff: string, fileName: string, agent: http.Agent | https.Agent, apiKey: string, aoiEndpoint: string, tokenMax: string | undefined, temperature: string | undefined, additionalPrompts: string[] = []) {
  console.log(`Starting review of file: ${fileName} ...`);

  const instructions = `You are a software development assistant.
                        Your mission is to act as a code reviewer for a Pull Request, providing feedback on potential bugs and clean code best practices, being didactic and using technical language.
                        You receive Pull Request changes in patch format, each patch entry has the commit message on the Subject line followed by code changes (diffs) in unidiff format.
                        As a code reviewer, your tasks are:
                        - Review only added, edited, or deleted lines.
                        - If there are no bugs and the changes are correct, write only the phrase 'No Feedback.'
                        - If there are bugs or incorrect code changes, do not write only the phrase 'No Feedback.'
                        - Provide only improvement instructions.
                ${additionalPrompts.length > 0 ? additionalPrompts.map(str => `- ${str}`).join('\n') : null}`;

  try {
    let choices: any;
    let response: any;
    if (tokenMax === undefined || tokenMax === '') {
      tokenMax = '100';
      console.log(`tokenMax out of range, defaulting to 100 to continue with the task.`);
    }
    if (temperature === undefined || temperature === '' || parseInt(temperature) > 2) {
      temperature = '0';
      console.log(`temperature out of range, defaulting to 0 to continue with the task.`);
    }

    try {
      const request = await fetch(aoiEndpoint, {
        method: 'POST',
        headers: { 'api-key': `${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: parseInt(`${tokenMax}`),
          temperature: parseInt(`${temperature}`),
          messages: [{
            role: "user",
            content: `${instructions}\n, patch : ${gitDiff}}`
          }]
        })
      });

      response = await request.json();

      choices = response.choices;
    }
    catch (responseError: any) {
      console.log(`Error encountered, validate input parameters. ${responseError.response.status} ${responseError.response.message}`);
    }

    if (choices && choices.length > 0) {
      const review = choices[0].message?.content as string;

      if (review.trim() !== "No feedback.") {
        await addCommentToPR(fileName, review, agent);
      }
    }

    console.log(`Review ${fileName} complete.`);
    consumeApi = `Usage: Completions: ${response.usage.completion_tokens}, Prompts: ${response.usage.prompt_tokens}, Total: ${response.usage.total_tokens}`; 
  }
  catch (error: any) {
    if (error.response) {
      console.log(error.response.status);
      console.log(error.response.data);
    } else {
      console.log(error.message);
    }
  }
}