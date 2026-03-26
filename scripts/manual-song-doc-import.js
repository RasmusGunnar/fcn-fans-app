const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const ROOT = process.cwd();
const DEFAULT_DOCX_PATH =
  'C:\\Users\\RasmusJakobsen\\Downloads\\\u00c6ndringer til hjemmesiden_ (3).docx';
const OUT_DIR = path.resolve(ROOT, 'dist', 'manual-song-doc-import');
const DEFAULT_XML_PATH = path.join(OUT_DIR, 'source_document.xml');
const DOCUMENT_PATH = path.join(OUT_DIR, 'document_songs.json');
const EXISTING_PATH = path.join(OUT_DIR, 'existing_songs.json');
const REPORT_PATH = path.join(OUT_DIR, 'match_report.json');
const SQL_PATH = path.resolve(
  ROOT,
  'supabase',
  'migrations',
  '20260326173000_import_missing_songs_from_document.sql',
);

const SECTION_HEADINGS = {
  spillersange: 'spillersang',
  slagsange: 'slagsang',
};

const SLAGSANG_STANDALONE_PREFIXES = new Set([
  'vi',
  'jeg',
  'nordsjælland',
  'drengene',
  'fc',
  'kald',
]);

const STANDALONE_FORBIDDEN_PREFIXES = new Set([
  'for',
  'pa',
  'mellem',
  'gamle',
  'folk',
  'lad',
  'la',
  'han',
  'hans',
  'men',
  'grib',
  'der',
  'ingen',
  'ambitioner',
  'ola',
  'boe',
  'we',
  'l',
]);

function getArgValue(flagName) {
  const prefix = `${flagName}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function docxPath() {
  return getArgValue('--docx') ?? DEFAULT_DOCX_PATH;
}

function xmlPath() {
  return getArgValue('--xml') ?? DEFAULT_XML_PATH;
}

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

function normalizeForMatch(value) {
  return normalizeWhitespace(value)
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u00b4`]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeLyricsForCompare(value) {
  return normalizeForMatch(value).replace(/\s+/g, ' ').trim();
}

function normalizeMelodyForCompare(value) {
  return value ? normalizeForMatch(value) : null;
}

function slugify(value) {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTitleKey(title, category) {
  return `${category}:${slugify(title)}`;
}

function buildProposedSourceKey(title, category) {
  return `manual-doc-import:${buildTitleKey(title, category)}`;
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    const map = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      nbsp: ' ',
      quot: '"',
    };

    return map[entity] ?? match;
  });
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Could not find end-of-central-directory record in .docx file.');
}

function extractZipEntry(buffer, entryName) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Malformed ZIP central directory in .docx file.');
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer
      .slice(cursor + 46, cursor + 46 + fileNameLength)
      .toString('utf8');

    if (fileName === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Malformed ZIP local header for ${entryName}.`);
      }

      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);

      if (compressionMethod === 0) {
        return compressed;
      }

      if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressed);
      }

      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${entryName}.`);
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Missing ${entryName} inside .docx file.`);
}

function cleanDocxText(value) {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

function finalizeExtractedLine(paragraphIndex, segments) {
  const nonWhitespaceSegments = segments.filter((segment) => segment.text.trim().length > 0);
  const text = cleanDocxText(segments.map((segment) => segment.text).join(''));
  return {
    paragraphIndex,
    text,
    startsBold: nonWhitespaceSegments[0]?.bold ?? false,
    allBold:
      nonWhitespaceSegments.length > 0 &&
      nonWhitespaceSegments.every((segment) => segment.bold === true),
    hasBold: nonWhitespaceSegments.some((segment) => segment.bold === true),
  };
}

function extractDocxLinesFromXml(xml) {
  const lines = [];
  const paragraphMatches = Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g));

  for (let index = 0; index < paragraphMatches.length; index += 1) {
    const paragraphXml = paragraphMatches[index][0];
    const paragraphIndex = index + 1;
    const runMatches = Array.from(paragraphXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g));
    let currentSegments = [];
    let hasAnyToken = false;

    for (const runMatch of runMatches) {
      const runXml = runMatch[0];
      const bold = /<w:b\b/.test(runXml) || /<w:bCs\b/.test(runXml);
      const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/?>|<w:tab\b[^>]*\/?>/g;

      for (const token of runXml.matchAll(tokenPattern)) {
        hasAnyToken = true;
        if (token[1] != null) {
          currentSegments.push({
            text: decodeXmlEntities(token[1]),
            bold,
          });
          continue;
        }

        if (token[0].startsWith('<w:tab')) {
          currentSegments.push({
            text: ' ',
            bold,
          });
          continue;
        }

        lines.push(finalizeExtractedLine(paragraphIndex, currentSegments));
        currentSegments = [];
      }
    }

    if (hasAnyToken) {
      lines.push(finalizeExtractedLine(paragraphIndex, currentSegments));
      continue;
    }

    lines.push(finalizeExtractedLine(paragraphIndex, []));
  }

  return lines;
}

function normalizeTitle(title) {
  return normalizeWhitespace(
    title.replace(/[:"]+$/g, '').replace(/\s+[\u2013\u2014-]\s*$/g, '').trim(),
  );
}

function normalizeMelodyValue(value) {
  if (!value) return null;
  const cleaned = normalizeWhitespace(value.replace(/^melodi\s*:\s*/i, '').trim());
  return cleaned.length > 0 ? cleaned : null;
}

function extractSectionLines(lines) {
  const sectionLines = {
    spillersang: [],
    slagsang: [],
  };
  const sectionTransitions = [];
  let currentCategory = null;

  for (const line of lines) {
    const sectionMatch = line.text.match(/^(Spillersange|Slagsange):$/i);
    if (sectionMatch) {
      currentCategory = SECTION_HEADINGS[sectionMatch[1].toLowerCase()];
      sectionTransitions.push({
        paragraphIndex: line.paragraphIndex,
        heading: sectionMatch[1],
        category: currentCategory,
      });
      continue;
    }

    if (!currentCategory) {
      continue;
    }

    sectionLines[currentCategory].push(line);
  }

  return { sectionLines, sectionTransitions };
}

function isTitleCaseName(text) {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/^[("'`]+|[)"'`,.!?]+$/g, ''))
    .filter(Boolean);

  if (words.length === 0 || words.length > 4) {
    return false;
  }

  return words.every((word) => /^[A-ZÆØÅ][\p{L}'-]*$/u.test(word) || /^[A-Z0-9]{2,}$/u.test(word));
}

function isLikelyStandaloneTitle(line, category) {
  const trimmed = line.text.trim();
  if (!trimmed) return false;
  if (!line.startsBold) return false;
  if (trimmed.includes('melodi')) return false;
  if (/^\[.+\]$/.test(trimmed)) return false;
  if (trimmed.length > 55) return false;
  if (/[.!?"]$/.test(trimmed)) return false;

  const normalized = normalizeForMatch(trimmed);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) return false;

  const firstWord = words[0];
  if (STANDALONE_FORBIDDEN_PREFIXES.has(firstWord)) return false;

  if (category === 'spillersang') {
    return firstWord === 'prince' || (line.allBold && isTitleCaseName(trimmed));
  }

  return SLAGSANG_STANDALONE_PREFIXES.has(firstWord);
}

function headerFromLine(line, category) {
  const trimmed = line.text.trim();
  if (!trimmed) return null;

  const melodyMatch = trimmed.match(/^(.*?)\s*[\u2013\u2014-]\s*melodi\s*:\s*(.*)$/i);
  if (melodyMatch && line.hasBold) {
    return {
      title: normalizeTitle(melodyMatch[1]),
      melodyReference: normalizeMelodyValue(melodyMatch[2]),
      headerKind: 'melody_header',
    };
  }

  if (trimmed.endsWith(':') && line.startsBold) {
    return {
      title: normalizeTitle(trimmed.slice(0, -1)),
      melodyReference: null,
      headerKind: 'colon_title',
    };
  }

  if (isLikelyStandaloneTitle(line, category)) {
    return {
      title: normalizeTitle(trimmed),
      melodyReference: null,
      headerKind: 'standalone_title',
    };
  }

  return null;
}

function finalizeSong(song, songs, uncertainCases, reasonIfIncomplete) {
  if (!song) return null;

  const compactLyrics = song.lyricsLines
    .map((line) => line.trim())
    .filter((line, index, items) => !(line === '' && (index === 0 || items[index - 1] === '')));

  while (compactLyrics.length > 0 && compactLyrics[0] === '') {
    compactLyrics.shift();
  }
  while (compactLyrics.length > 0 && compactLyrics[compactLyrics.length - 1] === '') {
    compactLyrics.pop();
  }

  const lyrics = compactLyrics.join('\n').trim();
  if (!lyrics) {
    uncertainCases.push({
      type: 'incomplete_song',
      category: song.category,
      title: song.title,
      melodyReference: song.melodyReference,
      paragraphStart: song.paragraphStart,
      reason: reasonIfIncomplete ?? 'Song title was found without lyrics.',
    });
    return null;
  }

  songs.push({
    title: song.title,
    lyrics,
    melodyReference: song.melodyReference,
    category: song.category,
    paragraphStart: song.paragraphStart,
    documentOrder: song.documentOrder,
  });

  return null;
}

function parseSectionSongs(category, sectionLines) {
  const songs = [];
  const uncertainCases = [];
  let currentSong = null;
  let orphanLines = [];
  let documentOrder = 0;
  let blankStreak = 0;

  function flushOrphans() {
    const useful = orphanLines.map((entry) => entry.text).filter((text) => text.length > 0);
    if (useful.length > 0) {
      uncertainCases.push({
        type: 'orphan_lyrics_block',
        category,
        paragraphStart: orphanLines[0].paragraphIndex,
        lines: useful,
        reason: 'Found lyric block without a confident song title.',
      });
    }
    orphanLines = [];
  }

  for (const line of sectionLines) {
    const trimmed = line.text.trim();

    if (!trimmed) {
      blankStreak += 1;
      if (currentSong && currentSong.lyricsLines.length > 0) {
        if (currentSong.lyricsLines[currentSong.lyricsLines.length - 1] !== '') {
          currentSong.lyricsLines.push('');
        }
      } else if (orphanLines.length > 0) {
        orphanLines.push({ paragraphIndex: line.paragraphIndex, text: '' });
      }
      continue;
    }

    const header = headerFromLine(line, category);
    if (currentSong && blankStreak >= 2 && !header && line.startsBold) {
      currentSong = finalizeSong(currentSong, songs, uncertainCases);
      flushOrphans();
      orphanLines.push({
        paragraphIndex: line.paragraphIndex,
        text: trimmed,
      });
      blankStreak = 0;
      continue;
    }

    blankStreak = 0;
    if (header && header.title) {
      currentSong = finalizeSong(currentSong, songs, uncertainCases);
      flushOrphans();
      documentOrder += 1;
      currentSong = {
        title: header.title,
        melodyReference: header.melodyReference,
        category,
        paragraphStart: line.paragraphIndex,
        documentOrder,
        lyricsLines: [],
      };
      continue;
    }

    if (currentSong) {
      currentSong.lyricsLines.push(trimmed);
    } else {
      orphanLines.push({
        paragraphIndex: line.paragraphIndex,
        text: trimmed,
      });
    }
  }

  finalizeSong(currentSong, songs, uncertainCases);
  flushOrphans();
  return { songs, uncertainCases };
}

function enrichSongsWithKeys(parsedSongs) {
  const seen = new Map();
  return parsedSongs.map((song) => {
    const matchKey = buildTitleKey(song.title, song.category);
    const occurrence = (seen.get(matchKey) ?? 0) + 1;
    seen.set(matchKey, occurrence);
    return {
      ...song,
      matchKey,
      proposedSourceKey: buildProposedSourceKey(song.title, song.category),
      occurrence,
    };
  });
}

function parseDocumentSongsFromXml(xml, sourceFile, sourceXml) {
  const lines = extractDocxLinesFromXml(xml);
  const { sectionLines, sectionTransitions } = extractSectionLines(lines);
  const parsedSongs = [];
  const uncertainCases = [];

  for (const category of ['spillersang', 'slagsang']) {
    const result = parseSectionSongs(category, sectionLines[category]);
    parsedSongs.push(...result.songs);
    uncertainCases.push(...result.uncertainCases);
  }

  return {
    sourceFile,
    sourceXml,
    sectionTransitions,
    songs: enrichSongsWithKeys(parsedSongs),
    uncertainCases,
  };
}

async function readEnvFile(filePath) {
  const result = {};
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    result[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return result;
}

async function fetchExistingSongsFromSupabase() {
  const env = await readEnvFile(path.resolve(ROOT, '.env'));
  const baseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  }

  const url = new URL(`${baseUrl}/rest/v1/songs`);
  url.searchParams.set(
    'select',
    [
      'id',
      'title',
      'lyrics',
      'spotify_url',
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
    ].join(','),
  );
  url.searchParams.set('order', 'category.asc,sort_order.asc,title.asc');

  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase songs query failed: ${response.status} ${body}`);
  }

  return response.json();
}

function buildExistingIndexes(existingSongs) {
  const byTitleKey = new Map();
  const byLyricsKey = new Map();
  const bySourceKey = new Map();

  for (const row of existingSongs) {
    const category = row.category === 'spillersang' ? 'spillersang' : 'slagsang';
    const titleKey = buildTitleKey(row.title ?? '', category);
    const lyricsKey = `${category}:${normalizeLyricsForCompare(row.lyrics ?? '')}`;
    const normalizedSourceKey = row.source_key ? normalizeForMatch(row.source_key) : null;
    const entry = {
      ...row,
      category,
      titleKey,
      lyricsKey,
      normalizedLyrics: normalizeLyricsForCompare(row.lyrics ?? ''),
      normalizedMelody: normalizeMelodyForCompare(row.melody_reference ?? null),
      normalizedSourceKey,
    };

    if (!byTitleKey.has(titleKey)) byTitleKey.set(titleKey, []);
    byTitleKey.get(titleKey).push(entry);

    if (!byLyricsKey.has(lyricsKey)) byLyricsKey.set(lyricsKey, []);
    byLyricsKey.get(lyricsKey).push(entry);

    if (normalizedSourceKey) {
      if (!bySourceKey.has(normalizedSourceKey)) bySourceKey.set(normalizedSourceKey, []);
      bySourceKey.get(normalizedSourceKey).push(entry);
    }
  }

  return { byTitleKey, byLyricsKey, bySourceKey };
}

function differingFields(song, existing) {
  const diffs = [];
  if (normalizeLyricsForCompare(song.lyrics) !== existing.normalizedLyrics) diffs.push('lyrics');
  if (normalizeMelodyForCompare(song.melodyReference) !== existing.normalizedMelody) {
    diffs.push('melodyReference');
  }
  return diffs;
}

function classifySongs(documentSongs, parserUncertainCases, existingSongs) {
  const { byTitleKey, byLyricsKey, bySourceKey } = buildExistingIndexes(existingSongs);
  const classifications = [];
  const blockedKeys = new Set(
    parserUncertainCases
      .filter((item) => item.title && item.category)
      .map((item) => buildTitleKey(item.title, item.category)),
  );

  function pushResult(status, song, reason, matches = [], matchMethod = null, differing = []) {
    classifications.push({
      status,
      song,
      reason,
      matches,
      matchMethod,
      differingFields: differing,
    });
  }

  for (const song of documentSongs) {
    if (blockedKeys.has(song.matchKey)) {
      pushResult(
        'USIKKER / KRAEVER MANUEL CHECK',
        song,
        'Parser flagged a conflicting or incomplete case for this title.',
      );
      continue;
    }

    const titleMatches = byTitleKey.get(song.matchKey) ?? [];
    if (titleMatches.length > 0) {
      const exactTitleAndLyricsMatches = titleMatches.filter(
        (entry) => entry.normalizedLyrics === normalizeLyricsForCompare(song.lyrics),
      );

      if (exactTitleAndLyricsMatches.length === 1) {
        const existing = exactTitleAndLyricsMatches[0];
        const diffs = differingFields(song, existing);
        pushResult(
          diffs.length === 0 ? 'FINDES ALLEREDE' : 'MULIG OPDATERING',
          song,
          diffs.length === 0
            ? 'Matched on normalized category + title, and lyrics also match.'
            : `Matched on normalized category + title, but differs in: ${diffs.join(', ')}.`,
          [existing],
          'title',
          diffs,
        );
        continue;
      }

      if (titleMatches.length === 1) {
        const existing = titleMatches[0];
        const diffs = differingFields(song, existing);
        pushResult(
          diffs.length === 0 ? 'FINDES ALLEREDE' : 'MULIG OPDATERING',
          song,
          diffs.length === 0
            ? 'Matched on normalized category + title.'
            : `Matched on normalized category + title, but differs in: ${diffs.join(', ')}.`,
          [existing],
          'title',
          diffs,
        );
        continue;
      }

      if (exactTitleAndLyricsMatches.length > 1) {
        pushResult(
          'USIKKER / KRAEVER MANUEL CHECK',
          song,
          'Multiple existing songs matched normalized category + title + lyrics.',
          exactTitleAndLyricsMatches,
          'title',
        );
        continue;
      }

      pushResult(
        'USIKKER / KRAEVER MANUEL CHECK',
        song,
        'Multiple existing songs matched normalized category + title, and lyrics did not disambiguate safely.',
        titleMatches,
        'title',
      );
      continue;
    }

    const sourceKeyMatches = bySourceKey.get(normalizeForMatch(song.proposedSourceKey)) ?? [];
    if (sourceKeyMatches.length === 1) {
      const existing = sourceKeyMatches[0];
      const diffs = differingFields(song, existing);
      pushResult(
        diffs.length === 0 ? 'FINDES ALLEREDE' : 'MULIG OPDATERING',
        song,
        diffs.length === 0
          ? 'Matched on source_key.'
          : `Matched on source_key, but differs in: ${diffs.join(', ')}.`,
        [existing],
        'source_key',
        diffs,
      );
      continue;
    }

    if (sourceKeyMatches.length > 1) {
      pushResult(
        'USIKKER / KRAEVER MANUEL CHECK',
        song,
        'Multiple existing songs matched the proposed source_key.',
        sourceKeyMatches,
        'source_key',
      );
      continue;
    }

    const lyricsKey = `${song.category}:${normalizeLyricsForCompare(song.lyrics)}`;
    const lyricMatches = byLyricsKey.get(lyricsKey) ?? [];
    if (lyricMatches.length === 1) {
      const existing = lyricMatches[0];
      const diffs = differingFields(song, existing);
      pushResult(
        diffs.length === 0 ? 'FINDES ALLEREDE' : 'MULIG OPDATERING',
        song,
        diffs.length === 0
          ? 'Matched on exact normalized lyrics to an existing song with a different title.'
          : `Matched on exact normalized lyrics, but differs in: ${diffs.join(', ')}.`,
        [existing],
        'lyrics',
        diffs,
      );
      continue;
    }

    if (lyricMatches.length > 1) {
      pushResult(
        'USIKKER / KRAEVER MANUEL CHECK',
        song,
        'Multiple existing songs matched exact normalized lyrics.',
        lyricMatches,
        'lyrics',
      );
      continue;
    }

    pushResult(
      'NY SANG',
      song,
      'No safe match on normalized category + title, source_key, or exact normalized lyrics.',
    );
  }

  return classifications;
}

function sqlQuote(value) {
  if (value == null) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(newSongs, sourceFile) {
  if (newSongs.length === 0) {
    return [
      '-- Generated by scripts/manual-song-doc-import.js',
      `-- Source document: ${path.basename(sourceFile)}`,
      '-- No new songs were identified for insertion.',
      'select 1;',
      '',
    ].join('\n');
  }

  const valuesSql = newSongs
    .map(({ song }, index) => {
      const baseSortOrder = song.category === 'spillersang' ? 1000 : 10;
      return `  (${[
        sqlQuote(song.title),
        sqlQuote(song.lyrics),
        sqlQuote(song.melodyReference),
        sqlQuote(song.category),
        baseSortOrder + index * 10,
      ].join(', ')})`;
    })
    .join(',\n');

  return [
    '-- Generated by scripts/manual-song-doc-import.js',
    `-- Source document: ${path.basename(sourceFile)}`,
    '-- Inserts only songs classified as NY SANG from the docx source.',
    '-- Existing songs are left untouched.',
    '-- source/source_key/source_url/source_hash are intentionally left NULL so',
    '-- future Wild Tigers sync can adopt matching unsourced rows by title.',
    '-- is_manually_edited is set to TRUE so any adopted row remains protected',
    '-- from blind content overwrites in the sync flow.',
    '',
    'with input_rows (title, lyrics, melody_reference, category, sort_order) as (',
    'values',
    valuesSql,
    ')',
    'insert into public.songs (',
    '  title,',
    '  lyrics,',
    '  melody_reference,',
    '  spotify_url,',
    '  category,',
    '  sort_order,',
    '  source,',
    '  source_url,',
    '  source_key,',
    '  source_hash,',
    '  imported_at,',
    '  last_synced_at,',
    '  is_manually_edited',
    ')',
    'select',
    '  i.title,',
    '  i.lyrics,',
    '  i.melody_reference,',
    '  null as spotify_url,',
    '  i.category,',
    '  i.sort_order,',
    '  null as source,',
    '  null as source_url,',
    '  null as source_key,',
    '  null as source_hash,',
    '  now() as imported_at,',
    '  now() as last_synced_at,',
    '  true as is_manually_edited',
    'from input_rows i',
    'where not exists (',
    '  select 1',
    '  from public.songs s',
    '  where s.category = i.category',
    "    and lower(regexp_replace(trim(s.title), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(i.title), '\\s+', ' ', 'g'))",
    "    and lower(regexp_replace(trim(s.lyrics), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(i.lyrics), '\\s+', ' ', 'g'))",
    ');',
    '',
  ].join('\n');
}

function summarize(document, classifications) {
  const grouped = {
    'FINDES ALLEREDE': [],
    'NY SANG': [],
    'MULIG OPDATERING': [],
    'USIKKER / KRAEVER MANUEL CHECK': [],
  };

  for (const item of classifications) {
    grouped[item.status].push(item);
  }

  return {
    sourceFile: document.sourceFile,
    sourceXml: document.sourceXml,
    document: {
      totalSongs: document.songs.length,
      spillersange: document.songs.filter((song) => song.category === 'spillersang').length,
      slagsange: document.songs.filter((song) => song.category === 'slagsang').length,
      titles: document.songs.map((song) => ({
        title: song.title,
        category: song.category,
        occurrence: song.occurrence,
        melodyReference: song.melodyReference,
        paragraphStart: song.paragraphStart,
        proposedSourceKey: song.proposedSourceKey,
      })),
      uncertainCases: document.uncertainCases,
    },
    matchReport: {
      existsAlready: grouped['FINDES ALLEREDE'].map((item) => ({
        title: item.song.title,
        category: item.song.category,
        occurrence: item.song.occurrence,
        matchedId: item.matches[0]?.id ?? null,
        matchedTitle: item.matches[0]?.title ?? null,
        matchMethod: item.matchMethod,
        reason: item.reason,
      })),
      newSongs: grouped['NY SANG'].map((item) => ({
        title: item.song.title,
        category: item.song.category,
        occurrence: item.song.occurrence,
        melodyReference: item.song.melodyReference,
        proposedSourceKey: item.song.proposedSourceKey,
        reason: item.reason,
      })),
      possibleUpdates: grouped['MULIG OPDATERING'].map((item) => ({
        title: item.song.title,
        category: item.song.category,
        occurrence: item.song.occurrence,
        matchedId: item.matches[0]?.id ?? null,
        matchedTitle: item.matches[0]?.title ?? null,
        matchMethod: item.matchMethod,
        differingFields: item.differingFields,
        reason: item.reason,
      })),
      uncertainMatches: grouped['USIKKER / KRAEVER MANUEL CHECK'].map((item) => ({
        title: item.song.title,
        category: item.song.category,
        occurrence: item.song.occurrence,
        matchedIds: item.matches.map((match) => match.id),
        matchMethod: item.matchMethod,
        reason: item.reason,
      })),
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function resolveSourceXml() {
  const explicitXmlPath = getArgValue('--xml');
  if (explicitXmlPath) {
    const xml = await fs.readFile(explicitXmlPath, 'utf8');
    return {
      xml,
      sourceFile: path.resolve(docxPath()),
      sourceXml: path.resolve(explicitXmlPath),
    };
  }

  const sourceFile = path.resolve(docxPath());
  const docxBuffer = await fs.readFile(sourceFile);
  const xmlBuffer = extractZipEntry(docxBuffer, 'word/document.xml');
  const xml = xmlBuffer.toString('utf8');
  const sourceXml = path.resolve(xmlPath());

  await fs.mkdir(path.dirname(sourceXml), { recursive: true });
  await fs.writeFile(sourceXml, xml, 'utf8');

  return {
    xml,
    sourceFile,
    sourceXml,
  };
}

async function main() {
  const skipDb = process.argv.includes('--skip-db');
  const { xml, sourceFile, sourceXml } = await resolveSourceXml();
  const document = parseDocumentSongsFromXml(xml, sourceFile, sourceXml);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await writeJson(DOCUMENT_PATH, document);

  if (skipDb) {
    console.log(
      JSON.stringify(
        {
          mode: 'document_only',
          sourceFile: document.sourceFile,
          sourceXml: document.sourceXml,
          outputs: {
            document: path.relative(ROOT, DOCUMENT_PATH),
          },
          counts: {
            documentSongs: document.songs.length,
            spillersange: document.songs.filter((song) => song.category === 'spillersang').length,
            slagsange: document.songs.filter((song) => song.category === 'slagsang').length,
            parserUncertainCases: document.uncertainCases.length,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const existingSongs = await fetchExistingSongsFromSupabase();
  const classifications = classifySongs(document.songs, document.uncertainCases, existingSongs);
  const report = summarize(document, classifications);
  const sql = buildSql(classifications.filter((item) => item.status === 'NY SANG'), sourceFile);

  await writeJson(EXISTING_PATH, existingSongs);
  await writeJson(REPORT_PATH, report);
  await fs.writeFile(SQL_PATH, sql, 'utf8');

  console.log(
    JSON.stringify(
      {
        mode: 'full_compare',
        sourceFile: document.sourceFile,
        sourceXml: document.sourceXml,
        outputs: {
          document: path.relative(ROOT, DOCUMENT_PATH),
          existingSongs: path.relative(ROOT, EXISTING_PATH),
          matchReport: path.relative(ROOT, REPORT_PATH),
          sql: path.relative(ROOT, SQL_PATH),
        },
        counts: {
          documentSongs: report.document.totalSongs,
          spillersange: report.document.spillersange,
          slagsange: report.document.slagsange,
          existsAlready: report.matchReport.existsAlready.length,
          newSongs: report.matchReport.newSongs.length,
          possibleUpdates: report.matchReport.possibleUpdates.length,
          uncertainMatches: report.matchReport.uncertainMatches.length,
          parserUncertainCases: report.document.uncertainCases.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
