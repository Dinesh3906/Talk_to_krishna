/**
 * Client-Side Text Sanitizer for Mobile UI
 * Strips raw markdown syntax, table borders, and hashtags if any leak from legacy streams.
 */
export function sanitizeConversationalText(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/\r\n/g, '\n');

  // Strip clinical therapist section titles and headers completely
  cleaned = cleaned.replace(/^[ \t]*(?:#{1,6}\s*)?(?:\d+\.\s*)?(?:Let the feeling surface|Grounding in the present|A small, intentional ritual|Acknowledge the (?:weight|feeling)|Practical steps you can take right now|Seek professional (?:help|support)|Small daily actions|Grounding techniques|What you can do|Coping (?:strategies|mechanisms)|Sleep hygiene|Notice the body|5-second pause|Sensory check|Write a note to yourself)[ \t]*$/gmi, '');

  // Strip Markdown headers (## 1. Title -> Title)
  cleaned = cleaned.replace(/^#{1,6}\s*(?:\d+\.\s*)?/gm, '');

  // Strip horizontal rules
  cleaned = cleaned.replace(/^[ \t]*(\*{3,}|-{3,}|_{3,})[ \t]*$/gm, '');

  // Strip bold/italics
  cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');

  // Strip code blocks
  cleaned = cleaned.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1');
  cleaned = cleaned.replace(/```[a-zA-Z]*/g, '');
  cleaned = cleaned.replace(/`/g, '');

  // Convert markdown tables to clean readable prose
  cleaned = cleaned.replace(/^[ \t]*\|.*?\|[ \t]*$/gm, (match) => {
    if (/^[ \t]*\|[-:\s|]+\|[ \t]*$/.test(match)) {
      return '';
    }
    const cells = match
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.some((c) => /^(action|why it helps|how to start|theme|key takeaway)$/i.test(c))) {
      return '';
    }
    if (cells.length >= 2) {
      return `${cells[0]}: ${cells.slice(1).join(' — ')}`;
    }
    return cells.join(', ');
  });

  // Strip leading bullet hyphens / asterisks
  cleaned = cleaned.replace(/^[ \t]*[-*+][ \t]+/gm, '');

  // Normalize excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
