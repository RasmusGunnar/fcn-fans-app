import { decodeHtmlEntities } from './text';

export function decodeHtml(value: string | null | undefined): string | null | undefined {
  if (value == null) {
    return value;
  }

  return decodeHtmlEntities(value);
}
