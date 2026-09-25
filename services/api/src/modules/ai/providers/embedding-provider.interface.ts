export interface EmbeddingProvider {
  readonly providerName: string;
  readonly dimensions: number;

  embedQuery(query: string): Promise<number[]>;
  embedDocument(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
