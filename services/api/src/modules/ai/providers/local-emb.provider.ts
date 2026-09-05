import { pipeline } from '@xenova/transformers';

export class LocalEmbeddingProvider {
  private static extractor: any = null;
  private static initPromise: Promise<any> | null = null;

  public static async getExtractor(): Promise<any> {
    if (this.extractor) return this.extractor;
    if (!this.initPromise) {
      this.initPromise = pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5');
    }
    this.extractor = await this.initPromise;
    return this.extractor;
  }

  /**
   * Generates normalized 768-dimensional embeddings for a batch of strings
   */
  public static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();

    // Batch embedding
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const dims = output.dims; // [batchSize, 768]
    const batchSize = dims[0];
    const embDim = dims[1]; // 768

    const results: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      const start = i * embDim;
      const end = start + embDim;
      results.push(Array.from(output.data.subarray(start, end)));
    }

    return results;
  }
}
