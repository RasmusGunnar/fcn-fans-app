import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

const RUN_DATE = '2026-03-26';
const SOURCE_URL = 'https://wildtigers.dk/fansange/';
const IMPORT_NOTE = 'manual_doc_import';
const DEFAULT_DOCUMENT = 'wt_fansange.html';
const REPORT_JSON_PATH = path.join('docs', `${RUN_DATE}_song_import_report.json`);
const REPORT_MD_PATH = path.join('docs', `${RUN_DATE}_song_import_report.md`);
const SQL_OUTPUT_PATH = path.join('supabase', 'sql', `${RUN_DATE}_manual_doc_import_missing_songs.sql`);

const SONG_COLUMNS = [
  'id',
  'title',
  'lyrics',
  'melody_reference',
  'category',
  'sort_order',
  'source',
  'source_url',
  'source_key',
  'source_hash',
  'imported_at',
  'last_synced_at',
  'is_manually_edited',
  'created_at',
  'updated_at',
].join(',');

const SECTION_CONFIG = [
  { sectionId: 'Slangsange', category: 'slagsang', sortBase: 10 },
  { sectionId: 'Spillersange', category: 'spillersang', sortBase: 1000 },
];

const HTML_ENTITY_MAP = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  oslash: 'o',
  Oslash: 'O',
  aelig: 'ae',
  AElig: 'AE',
  aring: 'aa',
  Aring: 'AA',
  eacute: 'e',
  Eacute: 'E',
};

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
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

function htmlToText(html) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function cleanSongText(text) {
  return normalizeWhitespace(
    text
      .replace(/^[\u201c\u201d"'`]+\s*/, '')
      .replace(/\s*[\u201c\u201d"'`]+$/, ''),
  );
}

function normalizeForMatch(value) {
  return normalizeWhitespace(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildStableSongKey(category, title) {
  return `${category}:${slugify(title)}`;
}

function normalizeLyricsForMatch(value) {
  return normalizeForMatch(value).replace(/\s+/g, ' ').trim();
}

function extractSectionHtml(html, sectionId) {
  const start = html.indexOf(`<section id="${sectionId}"`);
  if (start < 0) return null;

  const nextSection = html.indexOf('<section ', start + 1);
  const end = nextSection >= 0 ? nextSection : html.length;
  return html.slice(start, end);
}

function extractLastTitleFromContext(context) {
  const matches = Array.from(context.matchAll(/<div data-brz-translate-text="1">([\s\S]*?)<\/div>/g));
  if (matches.length === 0) return null;

  const title = cleanSongText(htmlToText(matches[matches.length - 1][1]));
  return title || null;
}

function extractPopupContentHtml(sectionHtml, popupStart) {
  const contentStart = sectionHtml.indexOf('<div data-brz-translate-text="1">', popupStart);
  if (contentStart < 0) return null;

  const tail = sectionHtml.slice(contentStart);
  const match = tail.match(/^<div data-brz-translate-text="1">([\s\S]*?)<\/div>/);
  return match?.[1] ?? null;
}

function extractLyricsAndMelody(popupContentHtml) {
  const paragraphMatches = Array.from(popupContentHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g));
  const lyricLines = [];
  let melodyReference = null;

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

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function parseSectionSongs(html, sectionId, category, sortBase) {
  const sectionHtml = extractSectionHtml(html, sectionId);
  if (!sectionHtml) {
    throw new Error(`Missing section ${sectionId}`);
  }

  const anchorPattern =
    /<a class="brz-a brz-container-link"[^>]*href="#([^"]+)"[^>]*data-brz-link-type="popup"><\/a>/g;
  const anchors = Array.from(sectionHtml.matchAll(anchorPattern));
  const songs = [];
  const warnings = [];

  for (let index = 0; index < anchors.length; index += 1) {
    const anchorMatch = anchors[index];
    const anchorIndex = anchorMatch.index ?? -1;
    if (anchorIndex < 0) continue;

    const titleContextStart = index === 0 ? 0 : (anchors[index - 1].index ?? 0);
    const title = extractLastTitleFromContext(sectionHtml.slice(titleContextStart, anchorIndex));
    if (!title) {
      warnings.push({
        category,
        sectionId,
        index,
        reason: 'Kunne ikke udlede titel fra popup-kontekst',
      });
      continue;
    }

    const popupStart = sectionHtml.indexOf('<div class="brz brz-popup2', anchorIndex);
    if (popupStart < 0) {
      warnings.push({
        category,
        sectionId,
        index,
        title,
        reason: 'Kunne ikke finde popup-indhold for titel',
      });
      continue;
    }

    const popupContentHtml = extractPopupContentHtml(sectionHtml, popupStart);
    if (!popupContentHtml) {
      warnings.push({
        category,
        sectionId,
        index,
        title,
        reason: 'Kunne ikke udtrække popup-html',
      });
      continue;
    }

    const { lyrics, melodyReference } = extractLyricsAndMelody(popupContentHtml);
    if (!lyrics) {
      warnings.push({
        category,
        sectionId,
        index,
        title,
        reason: 'Ingen tekstlinjer fundet i popup',
      });
      continue;
    }

    const stableKey = buildStableSongKey(category, title);
    const sourceHash = sha256Hex(
      JSON.stringify({
        title,
        lyrics,
        category,
        melodyReference,
      }),
    );

    const notes = [];
    if (melodyReference && /[([][^)\]]*$/.test(melodyReference)) {
      notes.push('Melodi-linje ser afbrudt ud');
    }

    songs.push({
      title,
      lyrics,
      melodyReference,
      category,
      stableKey,
      sourceHash,
      sourceUrl: `${SOURCE_URL}#${sectionId}`,
      sortOrder: sortBase + index * 10,
      notes,
    });
  }

  return { songs, warnings };
}

function parseDocumentSongs(html) {
  const allSongs = [];
  const allWarnings = [];

  for (const section of SECTION_CONFIG) {
    const { songs, warnings } = parseSectionSongs(
      html,
      section.sectionId,
      section.category,
      section.sortBase,
    );
    allSongs.push(...songs);
    allWarnings.push(...warnings);
  }

  return { songs: allSongs, warnings: allWarnings };
}

function parseEnv(text) {
  const result = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

function requestJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers,
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`HTTP ${response.statusCode}: ${body}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
    request.end();
  });
}

async function fetchExistingSongs(rootDir) {
  const envPath = path.join(rootDir, '.env');
  const envText = await fs.readFile(envPath, 'utf8');
  const env = parseEnv(envText);
  const baseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    throw new Error('Missing Supabase env vars in .env');
  }

  const url = new URL('/rest/v1/songs', baseUrl);
  url.searchParams.set('select', SONG_COLUMNS);
  url.searchParams.set('order', 'sort_order.asc,title.asc');

  const rows = await requestJson(url, {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  });

  return Array.isArray(rows) ? rows : [];
}

function buildExistingIndexes(existingSongs) {
  const byMatchKey = new Map();
  const bySourceKey = new Map();

  for (const row of existingSongs) {
    const category = row.category === 'spillersang' ? 'spillersang' : 'slagsang';
    const stableKey = row.title ? buildStableSongKey(category, row.title) : null;

    if (stableKey) {
      const rows = byMatchKey.get(stableKey) ?? [];
      rows.push(row);
      byMatchKey.set(stableKey, rows);
    }

    if (row.source_key) {
      const rows = bySourceKey.get(row.source_key) ?? [];
      rows.push(row);
      bySourceKey.set(row.source_key, rows);
    }
  }

  return { byMatchKey, bySourceKey };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }

  return deduped;
}

function classifySongs(parsedSongs, existingSongs, parserWarnings) {
  const { byMatchKey, bySourceKey } = buildExistingIndexes(existingSongs);
  const existsAlready = [];
  const newSongs = [];
  const possibleUpdates = [];
  const uncertainMatches = [];
  const uncertainCases = [...parserWarnings];

  for (const song of parsedSongs) {
    const titleMatches = byMatchKey.get(song.stableKey) ?? [];
    const sourceKeyMatches = bySourceKey.get(song.stableKey) ?? [];
    const candidates = dedupeRows([...titleMatches, ...sourceKeyMatches]);

    if (song.notes.length > 0) {
      uncertainCases.push({
        category: song.category,
        title: song.title,
        reason: song.notes.join('; '),
      });
    }

    if (candidates.length === 0) {
      newSongs.push(song);
      continue;
    }

    if (candidates.length > 1) {
      uncertainMatches.push({
        song,
        candidates: candidates.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          source: row.source,
          source_key: row.source_key,
        })),
        reason: 'Flere eksisterende rows matcher samme normaliserede title/category',
      });
      continue;
    }

    const existing = candidates[0];
    const lyricsSame =
      normalizeLyricsForMatch(existing.lyrics ?? '') === normalizeLyricsForMatch(song.lyrics);
    const melodySame =
      normalizeForMatch(existing.melody_reference ?? '') === normalizeForMatch(song.melodyReference ?? '');

    if (lyricsSame && melodySame) {
      existsAlready.push({
        song,
        existing: {
          id: existing.id,
          title: existing.title,
          category: existing.category,
          source: existing.source,
          source_key: existing.source_key,
        },
      });
      continue;
    }

    possibleUpdates.push({
      song,
      existing: {
        id: existing.id,
        title: existing.title,
        category: existing.category,
        source: existing.source,
        source_key: existing.source_key,
        is_manually_edited: existing.is_manually_edited,
      },
      differences: {
        lyricsSame,
        melodySame,
        existingLyrics: existing.lyrics ?? '',
        existingMelodyReference: existing.melody_reference ?? null,
      },
    });
  }

  return {
    existsAlready,
    newSongs,
    possibleUpdates,
    uncertainMatches,
    uncertainCases,
  };
}

function sqlString(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNormalizedTitle(title) {
  return normalizeForMatch(title).replace(/'/g, "''");
}

function buildInsertSql(song) {
  return `insert into public.songs (
  title,
  lyrics,
  melody_reference,
  category,
  sort_order,
  imported_at,
  is_manually_edited
)
select
  ${sqlString(song.title)},
  ${sqlString(song.lyrics)},
  ${sqlString(song.melodyReference)},
  ${sqlString(song.category)},
  ${song.sortOrder},
  now(),
  true
where not exists (
  select 1
  from public.songs s
  where lower(trim(s.category)) = ${sqlString(song.category)}
    and lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(s.title), '[[:space:]]+', ' ', 'g'),
          '[\u2018\u2019´]',
          '''',
          'g'
        ),
        '[\u201C\u201D]',
        '\"',
        'g'
      )
    ) = ${sqlString(sqlNormalizedTitle(song.title))}
);`;
}

function buildSqlFile(newSongs, documentPath) {
  const header = [
    '-- Manual doc import: insert only songs that are missing today.',
    '-- Source document was parsed locally and compared against public.songs before generating this file.',
    '-- Intentionally NOT setting source/source_key/source_hash yet.',
    '-- Reason: existing sync_wild_tigers_songs can adopt source-less rows by title later,',
    '-- while is_manually_edited = true prevents blind overwrite of imported text.',
    `-- Document: ${documentPath}`,
    `-- Generated: ${RUN_DATE}`,
    '',
  ];

  if (newSongs.length === 0) {
    return `${header.join('\n')}-- No missing songs were detected. No insert statements generated.\n`;
  }

  return `${header.join('\n')}${newSongs.map(buildInsertSql).join('\n\n')}\n`;
}

function formatSongLine(song) {
  return `- ${song.title}${song.melodyReference ? ` (melodi: ${song.melodyReference})` : ''}`;
}

function formatReportMarkdown(documentPath, parsedSongs, classification, sqlOutputPath) {
  const playerSongs = parsedSongs.filter((song) => song.category === 'spillersang');
  const chants = parsedSongs.filter((song) => song.category === 'slagsang');

  const lines = [
    '# Song Import Report',
    '',
    `Document: \`${documentPath}\``,
    `Generated: \`${RUN_DATE}\``,
    '',
    '## 1. DOKUMENTET FORTOLKET',
    `- antal spillersange: ${playerSongs.length}`,
    `- antal slagsange: ${chants.length}`,
    '- titler, spillersange:',
    ...playerSongs.map(formatSongLine),
    '- titler, slagsange:',
    ...chants.map(formatSongLine),
    '- usikre cases:',
    ...(classification.uncertainCases.length > 0
      ? classification.uncertainCases.map(
          (item) =>
            `- ${item.title ? `${item.title} (${item.category})` : item.category ?? 'ukendt'}: ${item.reason}`,
        )
      : ['- ingen']),
    '',
    '## 2. MATCH-RAPPORT',
    '- findes allerede:',
    ...(classification.existsAlready.length > 0
      ? classification.existsAlready.map(
          ({ song, existing }) => `- ${song.title} (${song.category}) -> ${existing.id}`,
        )
      : ['- ingen']),
    '- nye sange:',
    ...(classification.newSongs.length > 0
      ? classification.newSongs.map((song) => `- ${song.title} (${song.category})`)
      : ['- ingen']),
    '- mulige opdateringer:',
    ...(classification.possibleUpdates.length > 0
      ? classification.possibleUpdates.map(
          ({ song, existing, differences }) =>
            `- ${song.title} (${song.category}) -> ${existing.id}; lyricsSame=${differences.lyricsSame}; melodySame=${differences.melodySame}`,
        )
      : ['- ingen']),
    '- usikre matches:',
    ...(classification.uncertainMatches.length > 0
      ? classification.uncertainMatches.map(
          ({ song, reason }) => `- ${song.title} (${song.category}): ${reason}`,
        )
      : ['- ingen']),
    '',
    '## 3. ANBEFALET IMPORTSTRATEGI',
    '- Importer kun rows klassificeret som NY SANG.',
    '- Brug INSERT ... SELECT ... WHERE NOT EXISTS ... pr. sang.',
    '- Match beskyttes i SQL med category + normaliseret title.',
    '- Existing rows bliver ikke opdateret eller slettet.',
    '- Imported rows markeres med imported_at = now() og is_manually_edited = true.',
    '- source/source_key efterlades tomme, saa senere Wild Tigers sync kan adoptere row ved title-match i stedet for at skabe dubletter.',
    '',
    '## 4. FILER OPRETTET / AENDRET',
    `- \`${REPORT_JSON_PATH}\``,
    `- \`${REPORT_MD_PATH}\``,
    `- \`${sqlOutputPath}\``,
    `- \`scripts/plan-song-import.mjs\``,
  ];

  return `${lines.join('\n')}\n`;
}

async function writeOutputs(rootDir, parsedSongs, classification, documentPath) {
  const reportJson = {
    generatedAt: new Date().toISOString(),
    documentPath,
    counts: {
      spillersang: parsedSongs.filter((song) => song.category === 'spillersang').length,
      slagsang: parsedSongs.filter((song) => song.category === 'slagsang').length,
    },
    parsedSongs,
    classification,
  };

  const sql = buildSqlFile(classification.newSongs, documentPath);
  const markdown = formatReportMarkdown(documentPath, parsedSongs, classification, SQL_OUTPUT_PATH);

  await fs.writeFile(path.join(rootDir, REPORT_JSON_PATH), JSON.stringify(reportJson, null, 2));
  await fs.writeFile(path.join(rootDir, REPORT_MD_PATH), markdown);
  await fs.writeFile(path.join(rootDir, SQL_OUTPUT_PATH), sql);
}

async function main() {
  const rootDir = process.cwd();
  const documentArg = process.argv[2] ?? DEFAULT_DOCUMENT;
  const documentPath = path.isAbsolute(documentArg)
    ? documentArg
    : path.join(rootDir, documentArg);

  const html = await fs.readFile(documentPath, 'utf8');
  const existingSongs = await fetchExistingSongs(rootDir);
  const { songs: parsedSongs, warnings } = parseDocumentSongs(html);
  const classification = classifySongs(parsedSongs, existingSongs, warnings);

  await writeOutputs(rootDir, parsedSongs, classification, documentPath);

  const summary = {
    documentPath,
    parsed: parsedSongs.length,
    counts: {
      spillersang: parsedSongs.filter((song) => song.category === 'spillersang').length,
      slagsang: parsedSongs.filter((song) => song.category === 'slagsang').length,
    },
    existsAlready: classification.existsAlready.length,
    newSongs: classification.newSongs.length,
    possibleUpdates: classification.possibleUpdates.length,
    uncertainMatches: classification.uncertainMatches.length,
    uncertainCases: classification.uncertainCases.length,
    outputs: {
      reportJson: REPORT_JSON_PATH,
      reportMd: REPORT_MD_PATH,
      sql: SQL_OUTPUT_PATH,
    },
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || String(error)}\n`);
  process.exitCode = 1;
});
