import { StreamChunk } from '@talk-to-krisna/shared';

/** Incremental decoder for the JSON data frames used by the chat SSE endpoint. */
export class SseJsonDecoder {
  private buffer = '';
  private malformedFrames = 0;

  public get malformedFrameCount(): number {
    return this.malformedFrames;
  }

  public push(text: string): StreamChunk[] {
    this.buffer += text;
    this.buffer = this.buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return this.readCompleteFrames();
  }

  public finish(): StreamChunk[] {
    const remaining = this.buffer;
    this.buffer = '';
    const chunks = this.readFrame(remaining);
    return chunks;
  }

  private readCompleteFrames(): StreamChunk[] {
    const output: StreamChunk[] = [];
    let delimiter = this.buffer.indexOf('\n\n');
    while (delimiter !== -1) {
      const frame = this.buffer.slice(0, delimiter);
      this.buffer = this.buffer.slice(delimiter + 2);
      output.push(...this.readFrame(frame));
      delimiter = this.buffer.indexOf('\n\n');
    }
    return output;
  }

  private readFrame(frame: string): StreamChunk[] {
    const data = frame
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') return [];

    try {
      const parsed: unknown = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
        this.malformedFrames++;
        return [];
      }
      return [parsed as StreamChunk];
    } catch {
      this.malformedFrames++;
      return [];
    }
  }
}
