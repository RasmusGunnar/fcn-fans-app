// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createAdminClient, json, requireSyncSecret } from '../_shared/push.ts';

type SongCategory = 'slagsang' | 'spillersang';

type SyncRequest = {
  dryRun?: boolean;
};

type ParsedSong = {
  title: string;
  lyrics: string;
  category: SongCategory;
  melodyReference: string | null;
  sourceUrl: string;
  sourceKey: string;
  sourceHash: string;
  sortOrder: number;
};

type ExistingSongRow = {
  id: string;
  title: string | null;
  lyrics: string | null;
  category: string | null;
  sort_order: number | null;
  source: string | null;
  source_url: string | null;
  source_key: string | null;
  source_hash: string | null;
  imported_at: string | null;
  is_manually_edited: boolean | null;
};

const SOURCE = 'wildtigers';
const SOURCE_URL = 'https://wildtigers.dk/fansange/';
const SONG_COLUMNS =
  'id, title, lyrics, category, sort_order, source, source_url, source_key, source_hash, imported_at, is_manually_edited';

const SECTION_CONFIG: readonly {
  sectionId: string;
  category: SongCategory;
  sortBase: number;
}[] = [
  { sectionId: 'Slangsange', category: 'slagsang', sortBase: 10 },
  { sectionId: 'Spillersange', category: 'spillersang', sortBase: 1000 },
];

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  oslash: '\u00f8',
  Oslash: '\u00d8',
  aelig: '\u00e6',
  AElig: '\u00c6',
  aring: '\u00e5',
  Aring: '\u00c5',
  eacute: '\u00e9',
  Eacute: '\u00c9',
};

async function readHtmlAsUtf8(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // Wild Tigers declares UTF-8 in the document. Prefer raw UTF-8 decoding
  // over response.text(), which may respect an incorrect upstream charset.
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() ?? '';

  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return utf8Text;
    }
  }

  return utf8Text;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    return HTML_ENTITY_MAP[entity] ?? match;
  });
}

function htmlToText(html: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function cleanSongText(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/^[\u201c\u201d"'`]+\s*/, '')
      .replace(/\s*[\u201c\u201d"'`]+$/, ''),
  );
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTitleCategoryKey(title: string, category: SongCategory): string {
  return `${category}:${slugify(title)}`;
}

function extractSectionHtml(html: string, sectionId: string): string | null {
  const start = html.indexOf(`<section id="${sectionId}"`);
  if (start < 0) return null;

  const nextSection = html.indexOf('<section ', start + 1);
  const end = nextSection >= 0 ? nextSection : html.length;
  return html.slice(start, end);
}

function extractLastTitleFromContext(context: string): string | null {
  const matches = Array.from(context.matchAll(/<div data-brz-translate-text="1">([\s\S]*?)<\/div>/g));
  if (matches.length === 0) return null;

  const title = cleanSongText(htmlToText(matches[matches.length - 1][1]));
  return title || null;
}

function extractPopupContentHtml(sectionHtml: string, popupStart: number): string | null {
  const contentStart = sectionHtml.indexOf('<div data-brz-translate-text="1">', popupStart);
  if (contentStart < 0) return null;

  const tail = sectionHtml.slice(contentStart);
  const match = tail.match(/^<div data-brz-translate-text="1">([\s\S]*?)<\/div>/);
  return match?.[1] ?? null;
}

function extractPopupCustomId(popupChunk: string): string | null {
  const match = popupChunk.match(
    /<div class="brz brz-popup2[\s\S]*?data-brz-custom-id="([^"]+)"/,
  );
  return match?.[1] ?? null;
}

function extractLyricsAndMelody(popupContentHtml: string) {
  const paragraphMatches = Array.from(popupContentHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g));
  const lyricLines: string[] = [];
  let melodyReference: string | null = null;

  for (const match of paragraphMatches) {
    const rawText = cleanSongText(htmlToText(match[1]));
    if (!rawText) continue;

    const melodyMatch = rawText.match(/^\(?\s*melodi\s*:?\s*(.+?)\)?$/i);
    if (melodyMatch) {
      melodyReference = cleanSongText(melodyMatch[1]);
      continue;
    }

    lyricLines.push(rawText);
  }

  return {
    lyrics: lyricLines.join('\n').trim(),
    melodyReference: melodyReference || null,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function parseSectionSongs(
  html: string,
  sectionId: string,
  category: SongCategory,
  sortBase: number,
): Promise<ParsedSong[]> {
  const sectionHtml = extractSectionHtml(html, sectionId);
  if (!sectionHtml) {
    throw new Error(`Missing section ${sectionId}`);
  }

  const anchorPattern =
    /<a class="brz-a brz-container-link"[^>]*href="#([^"]+)"[^>]*data-brz-link-type="popup"><\/a>/g;
  const anchors = Array.from(sectionHtml.matchAll(anchorPattern));
  const songs: ParsedSong[] = [];
  const seenSourceKeys = new Set<string>();

  for (let index = 0; index < anchors.length; index += 1) {
    const anchorMatch = anchors[index];
    const anchorIndex = anchorMatch.index ?? -1;
    if (anchorIndex < 0) continue;

    const titleContextStart = index === 0 ? 0 : (anchors[index - 1].index ?? 0);
    const title = extractLastTitleFromContext(sectionHtml.slice(titleContextStart, anchorIndex));
    if (!title) continue;

    const popupStart = sectionHtml.indexOf('<div class="brz brz-popup2', anchorIndex);
    if (popupStart < 0) continue;

    const popupChunk = sectionHtml.slice(popupStart, popupStart + 5000);
    const popupCustomId = extractPopupCustomId(popupChunk);
    const popupContentHtml = extractPopupContentHtml(sectionHtml, popupStart);
    if (!popupCustomId || !popupContentHtml) continue;

    const { lyrics, melodyReference } = extractLyricsAndMelody(popupContentHtml);
    if (!lyrics) continue;

    let sourceKey = `${SOURCE}:${popupCustomId}`;
    if (seenSourceKeys.has(sourceKey)) {
      sourceKey = `${sourceKey}:${slugify(title) || index + 1}`;
    }
    seenSourceKeys.add(sourceKey);

    const sourceUrl = `${SOURCE_URL}#${sectionId}`;
    const sortOrder = sortBase + index * 10;
    const sourceHash = await sha256Hex(
      JSON.stringify({
        title,
        lyrics,
        category,
        melodyReference,
      }),
    );

    songs.push({
      title,
      lyrics,
      category,
      melodyReference,
      sourceUrl,
      sourceKey,
      sourceHash,
      sortOrder,
    });
  }

  return songs;
}

async function parseSongs(html: string): Promise<ParsedSong[]> {
  const parsedSections = await Promise.all(
    SECTION_CONFIG.map((section) =>
      parseSectionSongs(html, section.sectionId, section.category, section.sortBase),
    ),
  );

  return parsedSections.flat();
}

function buildUnsourcedTitleMap(existingSongs: ExistingSongRow[]) {
  const map = new Map<string, ExistingSongRow>();
  const duplicateKeys = new Set<string>();

  for (const row of existingSongs) {
    if (row.source || !row.title) continue;
    const category = row.category === 'spillersang' ? 'spillersang' : 'slagsang';
    const key = buildTitleCategoryKey(row.title, category);

    if (map.has(key)) {
      map.delete(key);
      duplicateKeys.add(key);
      continue;
    }

    if (!duplicateKeys.has(key)) {
      map.set(key, row);
    }
  }

  return { map, duplicateKeys };
}

async function readRequest(req: Request): Promise<SyncRequest> {
  const text = await req.text();
  if (!text) return {};

  try {
    return (JSON.parse(text) as SyncRequest) ?? {};
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const authError = requireSyncSecret(req);
  if (authError) {
    return authError;
  }

  try {
    const { dryRun = false } = await readRequest(req);

    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'fcn-fans-song-sync/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return json(502, {
        error: 'Failed to fetch Wild Tigers songs page',
        status: response.status,
      });
    }

    const html = await readHtmlAsUtf8(response);
    const parsedSongs = await parseSongs(html);

    if (parsedSongs.length === 0) {
      return json(502, { error: 'No songs parsed from Wild Tigers source' });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.from('songs').select(SONG_COLUMNS);
    if (error) {
      throw error;
    }

    const existingSongs = ((data as ExistingSongRow[] | null) ?? []).map((row) => ({
      ...row,
      is_manually_edited: row.is_manually_edited ?? false,
    }));

    const existingBySourceKey = new Map(
      existingSongs
        .filter((row) => row.source === SOURCE && row.source_key)
        .map((row) => [row.source_key as string, row]),
    );
    const { map: unsourcedByTitle, duplicateKeys } = buildUnsourcedTitleMap(existingSongs);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let adopted = 0;
    let skippedManualEdits = 0;

    const nowIso = new Date().toISOString();

    for (const song of parsedSongs) {
      let existing = existingBySourceKey.get(song.sourceKey) ?? null;
      let adoptedRow = false;

      if (!existing) {
        const titleKey = buildTitleCategoryKey(song.title, song.category);
        if (!duplicateKeys.has(titleKey)) {
          existing = unsourcedByTitle.get(titleKey) ?? null;
          adoptedRow = !!existing;
        }
      }

      if (!existing) {
        inserted += 1;
        if (!dryRun) {
          const { error: insertError } = await supabase.from('songs').insert({
            title: song.title,
            lyrics: song.lyrics,
            category: song.category,
            melody_reference: song.melodyReference,
            sort_order: song.sortOrder,
            source: SOURCE,
            source_url: song.sourceUrl,
            source_key: song.sourceKey,
            source_hash: song.sourceHash,
            imported_at: nowIso,
            last_synced_at: nowIso,
            is_manually_edited: false,
          });

          if (insertError) throw insertError;
        }
        continue;
      }

      const isManuallyEdited = existing.is_manually_edited ?? false;
      const hashChanged = existing.source_hash !== song.sourceHash;
      const sortOrderChanged = (existing.sort_order ?? 0) !== song.sortOrder;

      if (adoptedRow) {
        adopted += 1;
      }

      if (isManuallyEdited) {
        const manualPatch: Record<string, unknown> = {
          source: SOURCE,
          source_url: song.sourceUrl,
          source_key: song.sourceKey,
          imported_at: existing.imported_at ?? nowIso,
          last_synced_at: nowIso,
        };

        if (!existing.source_hash) {
          manualPatch.source_hash = song.sourceHash;
        }

        if (hashChanged && existing.source_hash) {
          skippedManualEdits += 1;
        } else {
          unchanged += 1;
        }

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('songs')
            .update(manualPatch)
            .eq('id', existing.id);

          if (updateError) throw updateError;
        }
        continue;
      }

      if (!hashChanged && !sortOrderChanged && existing.source === SOURCE) {
        unchanged += 1;
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('songs')
            .update({
              source_url: song.sourceUrl,
              last_synced_at: nowIso,
            })
            .eq('id', existing.id);

          if (updateError) throw updateError;
        }
        continue;
      }

      updated += 1;
      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('songs')
          .update({
            title: song.title,
            lyrics: song.lyrics,
            category: song.category,
            melody_reference: song.melodyReference,
            sort_order: song.sortOrder,
            source: SOURCE,
            source_url: song.sourceUrl,
            source_key: song.sourceKey,
            source_hash: song.sourceHash,
            imported_at: existing.imported_at ?? nowIso,
            last_synced_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      }
    }

    return json(200, {
      ok: true,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      dryRun,
      parsed: parsedSongs.length,
      inserted,
      updated,
      adopted,
      unchanged,
      skippedManualEdits,
      categories: {
        slagsang: parsedSongs.filter((song) => song.category === 'slagsang').length,
        spillersang: parsedSongs.filter((song) => song.category === 'spillersang').length,
      },
      sample: parsedSongs.slice(0, 3).map((song) => ({
        title: song.title,
        category: song.category,
        sourceKey: song.sourceKey,
      })),
    });
  } catch (error) {
    console.error('[sync_wild_tigers_songs] Failed', error);
    return json(500, { error: String(error) });
  }
});
