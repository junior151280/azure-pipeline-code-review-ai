import { AzureOpenAI } from 'openai';

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
  private client: AzureOpenAI;
  private endpoint: string;
  private deploymentName: string;
  private apiVersion: string;

  constructor(apiKey: string, endpoint: string) {
    this.endpoint = endpoint;
    
    // Parse the endpoint to extract base URL, deployment name, and API version
    const parsed = this.parseAzureEndpoint(endpoint);
    this.deploymentName = parsed.deploymentName;
    this.apiVersion = parsed.apiVersion;
    
    console.log(`Configuring Azure OpenAI client:`);
    console.log(`- Endpoint: ${parsed.azureEndpoint}`);
    console.log(`- Deployment: ${this.deploymentName}`);
    console.log(`- API Version: ${this.apiVersion}`);
    
    this.client = new AzureOpenAI({
      apiKey: apiKey,
      endpoint: parsed.azureEndpoint,
      apiVersion: this.apiVersion,
      deployment: this.deploymentName
    });
  }

  private parseAzureEndpoint(fullEndpoint: string): { azureEndpoint: string; deploymentName: string; apiVersion: string } {
    // Azure OpenAI endpoint format:
    // https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={version}
    // or
    // https://{admin-resource}.{region}.cognitiveservices.azure.com/openai/deployments/{deployment}/chat/completions?api-version={version}
    
    try {
      const url = new URL(fullEndpoint);
      
      // Extract deployment name from path
      // Path format: /openai/deployments/{deployment}/chat/completions
      const pathMatch = url.pathname.match(/\/openai\/deployments\/([^\/]+)/);
      const deploymentName = pathMatch ? pathMatch[1] : 'gpt-4o';
      
      // Extract API version from query string
      const apiVersion = url.searchParams.get('api-version') || '2024-02-15-preview';
      
      // Azure endpoint is just protocol + host (no path)
      const azureEndpoint = `${url.protocol}//${url.host}`;
      
      return { azureEndpoint, deploymentName, apiVersion };
    } catch (error) {
      console.warn(`Could not parse endpoint URL: ${fullEndpoint}`);
      // Extract base endpoint without path
      const baseMatch = fullEndpoint.match(/^(https?:\/\/[^\/]+)/);
      return {
        azureEndpoint: baseMatch ? baseMatch[1] : fullEndpoint,
        deploymentName: 'gpt-4o',
        apiVersion: '2024-02-15-preview'
      };
    }
  }

  async reviewCode(request: ReviewRequest): Promise<ReviewResponse> {
    const instructions = this.buildInstructions(request.additionalPrompts || []);
    const prompt = `${instructions}\n\nPatch to review:\n${request.gitDiff}`;

    console.log(`Calling Azure OpenAI API:`);
    console.log(`- Deployment: ${this.deploymentName}`);
    console.log(`- API Version: ${this.apiVersion}`);

    try {
      const response = await this.client.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        model: '' // Model is not used with AzureOpenAI, deployment is set in constructor
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
    } catch (error: any) {
      console.error(`OpenAI API Error Details:`);
      console.error(`- Status: ${error.status || 'unknown'}`);
      console.error(`- Message: ${error.message || 'unknown'}`);
      console.error(`- Type: ${error.type || 'unknown'}`);
      
      if (error.status === 404) {
        throw new Error(`Deployment '${this.deploymentName}' not found. Please check:\n` +
          `1. The deployment name matches your Azure OpenAI deployment\n` +
          `2. The endpoint URL is correct: ${this.endpoint}\n` +
          `3. The API version is supported: ${this.apiVersion}\n` +
          `4. The deployment is in the correct Azure region`);
      }
      
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
