export function extractHashtags(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/#\w+/g) || [];
  return Array.from(new Set(matches.map((tag) => tag.replace('#', '').toLowerCase())));
}
