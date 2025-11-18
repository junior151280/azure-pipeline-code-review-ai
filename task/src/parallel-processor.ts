export interface ParallelConfig {
  maxConcurrency: number;
  continueOnError: boolean;
}

export interface ProcessResult<T> {
  item: string;
  success: boolean;
  data?: T;
  error?: Error;
}

export interface BatchResult<T> {
  total: number;
  successful: number;
  failed: number;
  results: ProcessResult<T>[];
}

export class ParallelProcessor {
  private config: ParallelConfig;

  constructor(config?: Partial<ParallelConfig>) {
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 5,
      continueOnError: config?.continueOnError ?? true
    };
  }

  /**
   * Process items in parallel with controlled concurrency
   */
  async processInParallel<TInput, TOutput>(
    items: TInput[],
    processor: (item: TInput, index: number) => Promise<TOutput>,
    itemIdentifier: (item: TInput) => string = (item) => String(item)
  ): Promise<BatchResult<TOutput>> {
    if (items.length === 0) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        results: []
      };
    }

    console.log(`Processing ${items.length} items with concurrency limit of ${this.config.maxConcurrency}`);

    const results: ProcessResult<TOutput>[] = [];
    const batches = this.createBatches(items, this.config.maxConcurrency);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

      const batchPromises = batch.map(async ({ item, index }) => {
        const itemId = itemIdentifier(item);
        try {
          const data = await processor(item, index);
          return {
            item: itemId,
            success: true,
            data
          } as ProcessResult<TOutput>;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`Error processing item ${itemId}: ${err.message}`);
          
          if (!this.config.continueOnError) {
            throw err;
          }

          return {
            item: itemId,
            success: false,
            error: err
          } as ProcessResult<TOutput>;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // This should rarely happen since we catch errors in the processor
          console.error(`Unexpected batch processing error: ${result.reason}`);
          results.push({
            item: 'unknown',
            success: false,
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason))
          });
        }
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Batch processing complete: ${successful} successful, ${failed} failed out of ${results.length} total`);

    return {
      total: results.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Create batches from items array based on concurrency limit
   */
  private createBatches<T>(items: T[], batchSize: number): Array<{ item: T; index: number }[]> {
    const batches: Array<{ item: T; index: number }[]> = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize).map((item, batchIndex) => ({
        item,
        index: i + batchIndex
      }));
      batches.push(batch);
    }
    
    return batches;
  }

  /**
   * Get current configuration
   */
  getConfig(): ParallelConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ParallelConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}
