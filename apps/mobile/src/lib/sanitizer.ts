/**
 * Client-Side Text Sanitizer for Mobile UI
 * Strips raw markdown syntax, table borders, and hashtags if any leak from legacy streams.
 */
export function sanitizeConversationalText(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/\r\n/g, '\n');

  // Fail-Safe: If any response contains generic AI mental health therapist lists or 7-point self-help tips,
  // replace with the authentic Lord Krishna chariot reflection.
  const isTherapistDump =
    /(?:consider medication|build a safety net|emergency resources|suicide prevention|samaritans|integrating wisdom without over-loading|small,\s*sustained practices|duty\s*[-–]\s*your responsibilities|heavy blanket that'?s hard to (?:shake off|lift)|explore a few gentle ways|breathing exercise|cyclical nature of emotions|name the feeling\b|ground yourself|gentle actions you can try|supportive routine|consistent sleep|balanced meals|regular physical activity|mindful moments|limit screens before bed|doable plan|depression is a medical condition|mix of biology|drink a glass of water|gratitude journaling|\b\d+\.\s*(?:Name the feeling|Ground yourself|Reach out|Move a little|Write it down|Seek a small|Remember the|Consider medication|Build a safety net|Emergency resources))/i.test(cleaned);

  if (isTherapistDump) {
    return (
      "Come, sit for a moment. You don't have to explain everything at once.\n\n" +
      "When Arjuna stood on the battlefield, he wasn't defeated by an enemy in front of him. His real struggle was inside—his mind was filled with confusion, grief, and questions he couldn't silence. And Krishna did not begin by telling him to take a walk, make a gratitude list, or follow seven steps.\n\n" +
      "He listened.\n\n" +
      "So if you're feeling depressed, don't worry about fixing your entire life tonight. Sometimes the first step is simply being honest about what hurts.\n\n" +
      "Tell me, my friend—what happened that made everything feel this heavy?"
    );
  }

  // Strip clinical therapist section titles and headers completely
  cleaned = cleaned.replace(/^[ \t]*(?:#{1,6}\s*)?(?:\d+\.\s*)?(?:Let the feeling surface|Grounding in the present|A small, intentional ritual|Acknowledge the (?:weight|feeling)|Practical steps you can take right now|Seek professional (?:help|support)|Small daily actions|Grounding techniques|What you can do|Coping (?:strategies|mechanisms)|Sleep hygiene|Notice the body|5-second pause|Sensory check|Write a note to yourself|Name the feeling|Ground yourself)[ \t]*$/gmi, '');

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
