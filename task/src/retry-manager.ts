export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

export class RetryManager {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      initialDelayMs: config?.initialDelayMs ?? 1000,
      maxDelayMs: config?.maxDelayMs ?? 30000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
      retryableStatusCodes: config?.retryableStatusCodes ?? [429, 500, 502, 503, 504]
    };
  }

  /**
   * Execute a function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt}/${this.config.maxRetries} for ${context}`);
        }

        const result = await fn();
        
        if (attempt > 0) {
          console.log(`✓ ${context} succeeded on attempt ${attempt + 1}`);
        }
        
        return result;
      } catch (error: any) {
        attempt++;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        const hasRetriesLeft = attempt <= this.config.maxRetries;

        if (!isRetryable || !hasRetriesLeft) {
          console.error(`✗ ${context} failed after ${attempt} attempt(s): ${lastError.message}`);
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt);
        console.log(`Retryable error for ${context}: ${lastError.message}. Waiting ${delay}ms before retry...`);
        
        await this.sleep(delay);
      }
    }

    throw lastError || new Error(`${context} failed after ${attempt} attempts`);
  }

  /**
   * Check if an error is retryable based on status code or error type
   */
  private isRetryableError(error: any): boolean {
    // Check for HTTP status codes
    if (error.status && this.config.retryableStatusCodes.includes(error.status)) {
      return true;
    }

    // Check for network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
      return true;
    }

    // Check for rate limit errors
    if (error.message && error.message.toLowerCase().includes('rate limit')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
    
    // Add jitter (random variation ±20%) to prevent thundering herd
    const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);
    
    return Math.round(cappedDelay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}
