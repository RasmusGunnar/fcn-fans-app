import { repairEncoding } from './text';

export function fixEncoding(value: string | null | undefined): string | null | undefined {
  if (value == null) {
    return value;
  }

  return repairEncoding(value);
}
