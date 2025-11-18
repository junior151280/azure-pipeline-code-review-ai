import { OpenAIClient, ReviewRequest } from './openai-client';
import { addCommentToPR } from './pr';

export interface ReviewResult {
  fileName: string;
  hasComments: boolean;
  usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };
}

export async function reviewFile(
  gitDiff: string, 
  fileName: string, 
  apiKey: string, 
  endpoint: string, 
  model: string,
  maxTokens: number, 
  temperature: number, 
  additionalPrompts: string[] = []
): Promise<ReviewResult> {
  console.log(`Starting review of file: ${fileName}...`);

  try {
    const client = new OpenAIClient(apiKey, endpoint);

    const request: ReviewRequest = {
      gitDiff,
      fileName,
      apiKey,
      endpoint,
      model,
      maxTokens,
      temperature,
      additionalPrompts
    };

    const response = await client.reviewCode(request);

    const reviewText = response.review.trim();
    const hasComments = reviewText !== "No Feedback." && reviewText !== "No feedback.";

    if (hasComments) {
      await addCommentToPR(fileName, response.review);
    }

    console.log(`Review ${fileName} complete.`);

    return {
      fileName,
      hasComments,
      usage: response.usage
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error reviewing file ${fileName}: ${error.message}`);
      throw error;
    }
    throw new Error(`Unknown error reviewing file ${fileName}`);
  }
}