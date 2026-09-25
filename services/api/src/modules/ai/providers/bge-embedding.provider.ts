import { EmbeddingProvider } from './embedding-provider.interface.js';

export class BgeEmbeddingProvider implements EmbeddingProvider {
  public readonly providerName = 'bge-base-en-v1.5';
  public readonly dimensions = 768;

  private static extractor: any = null;
  private static initPromise: Promise<any> | null = null;
  private static queue: Promise<any> = Promise.resolve();

  private static async getExtractor(): Promise<any> {
    if (this.extractor) return this.extractor;
    if (!this.initPromise) {
      const { pipeline } = await import('@xenova/transformers');
      this.initPromise = pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5', { quantized: true });
    }
    this.extractor = await this.initPromise;
    return this.extractor;
  }

  public async embedQuery(query: string): Promise<number[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('[BgeEmbeddingProvider] Cannot embed empty query');
    }
    const [emb] = await this.embedBatch([query.trim()]);
    if (!emb || emb.length !== this.dimensions) {
      throw new Error('[BgeEmbeddingProvider] Failed to generate valid embedding');
    }
    return emb;
  }

  public async embedDocument(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('[BgeEmbeddingProvider] Cannot embed empty document');
    }
    const [emb] = await this.embedBatch([text.trim()]);
    if (!emb || emb.length !== this.dimensions) {
      throw new Error('[BgeEmbeddingProvider] Failed to generate valid embedding');
    }
    return emb;
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const res = await (BgeEmbeddingProvider.queue = BgeEmbeddingProvider.queue.then(async () => {
        const extractor = await BgeEmbeddingProvider.getExtractor();
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
      }));

      return res;
    } catch (err: any) {
      console.error('[BgeEmbeddingProvider Error]: Failed to generate embeddings:', err.message);
      throw new Error(`[BgeEmbeddingProvider] Embedding generation failed: ${err.message}`);
    }
  }
}

export const defaultEmbeddingProvider: EmbeddingProvider = new BgeEmbeddingProvider();
