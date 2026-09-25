/**
 * Server-Side Output Sanitizer
 * Enforces the strict NO-MARKDOWN contract for Talk to Krishna.
 * Normalizes accidental Markdown syntax without corrupting normal prose or punctuation.
 */

export class MarkdownSanitizer {
  /**
   * Sanitizes a text block, stripping all Markdown formatting.
   * @param preserveBoundaryWhitespace When true, preserves leading/trailing spaces for streaming chunks.
   */
  public static sanitize(text: string, preserveBoundaryWhitespace: boolean = false): string {
    if (!text) return '';

    let cleaned = text.replace(/\r\n/g, '\n');

    // 1. Remove Markdown headers (# Header, ## Header, ### Header, ## 1. Header)
    cleaned = cleaned.replace(/^#{1,6}\s*(?:\d+\.\s*)?/gm, '');

    // 2. Remove horizontal rules (---, ***, ___) with optional trailing spaces
    cleaned = cleaned.replace(/^[ \t]*(\*{3,}|-{3,}|_{3,})[ \t]*$/gm, '');

    // 3. Remove bold and italic markers (**text**, *text*, __text__, _text_)
    cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
    cleaned = cleaned.replace(/___(.*?)___/g, '$1');
    cleaned = cleaned.replace(/__(.*?)__/g, '$1');
    // Note: avoid replacing single underscores within identifiers/words like parva_bhishma if any
    cleaned = cleaned.replace(/(^|\s)_(.*?)_(\s|$|[.,!?])/g, '$1$2$3');

    // 4. Remove bullet list markers at start of lines (- item, * item, + item)
    cleaned = cleaned.replace(/^[ \t]*[-*+][ \t]+/gm, '');

    // 5. Remove numbered list prefixes at start of lines (1. item, 2. item)
    cleaned = cleaned.replace(/^[ \t]*\d+\.[ \t]+/gm, '');

    // 6. Remove blockquote markers (> quote)
    cleaned = cleaned.replace(/^[ \t]*>[ \t]?/gm, '');

    // 7. Strictly remove all code fences, language tags (```text, ```json, etc.), and backticks
    // Extract inner content if full pair exists
    cleaned = cleaned.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1');
    // Strip any remaining opening, closing, or unclosed code fence markers (e.g. ```text, ```)
    cleaned = cleaned.replace(/```[a-zA-Z]*/g, '');
    cleaned = cleaned.replace(/```/g, '');
    // Strip inline backticks (`code` -> code, stray ` -> empty)
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
    cleaned = cleaned.replace(/`/g, '');

    // 8. Clean Markdown tables (| col | col |, |---|---|)
    cleaned = cleaned.replace(/^[ \t]*\|.*?\|[ \t]*$/gm, (match) => {
      // If it's a separator line like |---|---|, remove it completely
      if (/^[ \t]*\|[-:\s|]+\|[ \t]*$/.test(match)) {
        return '';
      }
      const cells = match
        .split('|')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      // If it's a generic table header row, skip it
      if (cells.some(c => /^(theme|key takeaway|approach|what it gives you|resource|what it offers|passage|core idea|aspect|topic)$/i.test(c))) {
        return '';
      }

      if (cells.length >= 2) {
        return `${cells[0]}: ${cells.slice(1).join(' - ')}`;
      }
      return cells.join(', ');
    });

    // 9. Remove explicit section headers like "Shloka:", "Meaning:", "Deep Meaning:", "Application:", "Key Takeaways:"
    cleaned = cleaned.replace(/^[ \t]*(?:Shloka|Meaning|Deep Meaning|Application|Key Takeaways|Summary|Explanation):[ \t]*/gmi, '');

    // 10. Normalize multiple blank lines to at most 2 (single paragraph break)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return preserveBoundaryWhitespace ? cleaned : cleaned.trim();
  }
}

/**
 * StreamTokenFilter
 * Stateful streaming filter that intercepts incoming SSE tokens, buffers potential markdown
 * sequences (like `**`, `##`, `---`, ````), strips markdown markers, and emits clean text tokens.
 */
export class StreamTokenFilter {
  private buffer: string = '';

  /**
   * Pushes a new raw token from the LLM stream.
   * Returns a sanitized token string to emit (or empty string if buffering a potential marker).
   */
  public push(token: string): string {
    this.buffer += token;

    // Immediately sanitize complete or partial code fence tokens like ```text or ```
    if (this.buffer.includes('```')) {
      this.buffer = this.buffer.replace(/```[a-zA-Z]*\r?\n?/g, '');
      this.buffer = this.buffer.replace(/```/g, '');
    }

    // Strip standalone backticks
    this.buffer = this.buffer.replace(/`/g, '');

    // If buffer ends with characters that might be part of an incomplete markdown sequence (e.g. "*", "#", "-", "`")
    // keep at most 3 trailing characters in the buffer and emit the rest sanitized.
    const trailingSuspiciousMatch = this.buffer.match(/[*#\-_`|>]{1,3}$/);
    if (trailingSuspiciousMatch) {
      const splitIndex = trailingSuspiciousMatch.index ?? this.buffer.length;
      const toEmit = this.buffer.slice(0, splitIndex);
      this.buffer = this.buffer.slice(splitIndex);

      return MarkdownSanitizer.sanitize(toEmit, true);
    }

    // Otherwise sanitize the entire buffer and clear it
    const output = MarkdownSanitizer.sanitize(this.buffer, true);
    this.buffer = '';
    return output;
  }

  /**
   * Flushes any remaining characters when the stream finishes.
   */
  public flush(): string {
    const remaining = this.buffer
      .replace(/```[a-zA-Z]*\r?\n?/g, '')
      .replace(/```/g, '')
      .replace(/`/g, '');
    this.buffer = '';
    return MarkdownSanitizer.sanitize(remaining, true);
  }
}
