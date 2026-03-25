const DANISH_CHAR_MAP: Record<string, string> = {
  æ: 'ae',
  ø: 'oe',
  å: 'aa',
};

export function normalizeDisplayNameToUsername(value: string): string | null {
  const trimmed = value.trim().replace(/^@+/, '').toLowerCase();
  if (!trimmed) {
    return null;
  }

  const mapped = trimmed.replace(/[æøå]/g, (character) => DANISH_CHAR_MAP[character] ?? character);
  const normalized = mapped
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : null;
}
