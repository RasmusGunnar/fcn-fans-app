export function extractMentions(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/@\w+/g) || [];
  return Array.from(new Set(matches.map((mention) => mention.replace('@', '').toLowerCase())));
}
