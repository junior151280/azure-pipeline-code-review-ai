import OpenAI from 'openai';

export interface ReviewRequest {
  gitDiff: string;
  fileName: string;
  apiKey: string;
  endpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  additionalPrompts?: string[];
}

export interface ReviewResponse {
  review: string;
  usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };
}

export class OpenAIClient {
  private client: OpenAI;

  constructor(apiKey: string, endpoint: string) {
    // Azure OpenAI requires a specific configuration
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: endpoint,
      defaultHeaders: {
        'api-key': apiKey
      },
      defaultQuery: undefined
    });
  }

  async reviewCode(request: ReviewRequest): Promise<ReviewResponse> {
    const instructions = this.buildInstructions(request.additionalPrompts || []);
    const prompt = `${instructions}\n\nPatch to review:\n${request.gitDiff}`;

    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: request.maxTokens,
        temperature: request.temperature
      });

      const review = response.choices[0]?.message?.content || 'No review generated.';
      const usage = response.usage;

      if (!usage) {
        throw new Error('No usage information returned from API');
      }

      return {
        review,
        usage: {
          completionTokens: usage.completion_tokens,
          promptTokens: usage.prompt_tokens,
          totalTokens: usage.total_tokens
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  private buildInstructions(additionalPrompts: string[]): string {
    const baseInstructions = `You are a software development assistant.
Your mission is to act as a code reviewer for a Pull Request, providing feedback on potential bugs and clean code best practices, being didactic and using technical language.
You receive Pull Request changes in patch format, each patch entry has the commit message on the Subject line followed by code changes (diffs) in unidiff format.
As a code reviewer, your tasks are:
- Review only added, edited, or deleted lines.
- If there are no bugs and the changes are correct, write only the phrase 'No Feedback.'
- If there are bugs or incorrect code changes, do not write only the phrase 'No Feedback.'
- Provide only improvement instructions.`;

    if (additionalPrompts.length > 0) {
      const additionalInstructions = additionalPrompts
        .map(prompt => `- ${prompt.trim()}`)
        .join('\n');
      return `${baseInstructions}\n${additionalInstructions}`;
    }

    return baseInstructions;
  }
}
