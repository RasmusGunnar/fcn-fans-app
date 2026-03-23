const MOJIBAKE_MARKER_REGEX = /(?:Ã.|Â.|â€¦|â€”|â€“|â€œ|â€\u009d|â€\u0099|â€\u0098|â‚¬|�)/gu;

function countEncodingNoise(value: string): number {
  const markerCount = value.match(MOJIBAKE_MARKER_REGEX)?.length ?? 0;
  const replacementCount = value.match(/�/g)?.length ?? 0;
  return markerCount * 10 + replacementCount * 25;
}

function looksMisencoded(value: string): boolean {
  return countEncodingNoise(value) > 0;
}

function decodeLatin1AsUtf8(value: string): string {
  const bytes = Uint8Array.from(Array.from(value), (char) => char.charCodeAt(0) & 0xff);
  return new TextDecoder("utf-8").decode(bytes);
}

export function fixEncoding(value: string | null | undefined): string {
  if (!value) return "";

  let current = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!looksMisencoded(current)) {
      break;
    }

    let decoded: string;
    try {
      decoded = decodeLatin1AsUtf8(current);
    } catch {
      break;
    }

    if (countEncodingNoise(decoded) >= countEncodingNoise(current)) {
      break;
    }

    current = decoded;
  }

  return current;
}

function normalizeCharset(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "utf8") return "utf-8";
  if (normalized === "latin1" || normalized === "latin-1" || normalized === "iso8859-1") {
    return "iso-8859-1";
  }
  if (normalized === "windows1252" || normalized === "cp1252") {
    return "windows-1252";
  }
  return normalized;
}

function extractCharsetFromHeader(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s>]+)/i);
  return normalizeCharset(match?.[1] ?? null);
}

function extractCharsetFromDocument(text: string): string | null {
  const metaCharset = text.match(/<meta[^>]+charset=["']?([^"'>\s]+)/i)?.[1];
  if (metaCharset) {
    return normalizeCharset(metaCharset);
  }

  const metaHttpEquiv = text.match(
    /<meta[^>]+content=["'][^"']*charset=([^"'>;\s]+)[^"']*["'][^>]*>/i,
  )?.[1];
  if (metaHttpEquiv) {
    return normalizeCharset(metaHttpEquiv);
  }

  const xmlEncoding = text.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i)?.[1];
  return normalizeCharset(xmlEncoding ?? null);
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function decodeResponseText(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const headerCharset = extractCharsetFromHeader(response.headers.get("content-type"));

  if (headerCharset) {
    return fixEncoding(decodeBytes(bytes, headerCharset));
  }

  const utf8Text = new TextDecoder("utf-8").decode(bytes);
  const sniffedCharset = extractCharsetFromDocument(utf8Text);

  if (sniffedCharset && sniffedCharset !== "utf-8") {
    return fixEncoding(decodeBytes(bytes, sniffedCharset));
  }

  return fixEncoding(utf8Text);
}
