import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSongAudioPath,
  formatSongAudioTime,
  getSongAudioDisplayPosition,
  runSongAudioSaveSaga,
  runSongDeleteSaga,
  SONG_AUDIO_MAX_SIZE_BYTES,
  SongAudioValidationError,
  type SongAudioMetadata,
  type SongAudioUploadCandidate,
  validateSongAudioFile,
} from '../songAudio';

const SONG_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';

function validate(name: string, mimeType?: string, size = 1024) {
  return validateSongAudioFile({ uri: 'file:///picked-audio', name, mimeType, size });
}

function candidate(extension: 'mp3' | 'm4a' | 'aac' = 'mp3'): SongAudioUploadCandidate {
  const mimeType =
    extension === 'mp3' ? 'audio/mpeg' : extension === 'm4a' ? 'audio/mp4' : 'audio/aac';
  return {
    uri: 'file:///picked-audio',
    name: `supportersang.${extension}`,
    size: 1024,
    extension,
    mimeType,
    storagePath: buildSongAudioPath(SONG_ID, FILE_ID, extension),
  };
}

function metadata(path = `${SONG_ID}/${FILE_ID}.mp3`): SongAudioMetadata {
  return { path, mimeType: 'audio/mpeg', sizeBytes: 1024 };
}

function assertValidationError(run: () => unknown, code: SongAudioValidationError['code']) {
  assert.throws(run, (error: unknown) => {
    return error instanceof SongAudioValidationError && error.code === code;
  });
}

test('canonicalizes MP3 and known MP3 MIME variants', () => {
  assert.equal(validate('song.mp3', 'audio/mpeg').mimeType, 'audio/mpeg');
  assert.equal(validate('song.mp3', 'audio/mp3').mimeType, 'audio/mpeg');
});

test('canonicalizes M4A and AAC MIME variants', () => {
  assert.equal(validate('song.m4a', 'audio/x-m4a').mimeType, 'audio/mp4');
  assert.equal(validate('song.m4a', 'audio/m4a').mimeType, 'audio/mp4');
  assert.equal(validate('song.aac', 'audio/x-aac').mimeType, 'audio/aac');
});

test('accepts uppercase extensions and generic MIME only for known extensions', () => {
  assert.equal(validate('SONG.MP3', 'application/octet-stream').extension, 'mp3');
  assert.equal(validate('song.aac').mimeType, 'audio/aac');
  assertValidationError(() => validate('song.wav', 'application/octet-stream'), 'invalid_format');
});

test('rejects WAV, executable files, MIME mismatches, empty files, and oversized files', () => {
  assertValidationError(() => validate('song.wav', 'audio/wav'), 'invalid_format');
  assertValidationError(() => validate('song.exe', 'application/octet-stream'), 'invalid_format');
  assertValidationError(() => validate('song.mp3', 'audio/mp4'), 'invalid_format');
  assertValidationError(() => validate('song.mp3', 'audio/mpeg', 0), 'empty_file');
  assertValidationError(
    () => validate('song.mp3', 'audio/mpeg', SONG_AUDIO_MAX_SIZE_BYTES + 1),
    'too_large',
  );
});

test('generates a path under the song UUID without using the picked filename', () => {
  const path = buildSongAudioPath(SONG_ID, FILE_ID, 'm4a');
  assert.equal(path, `${SONG_ID}/${FILE_ID}.m4a`);
  assert.doesNotMatch(path, /supportersang/i);
});

test('save saga leaves audio untouched for a text-only edit', async () => {
  const calls: string[] = [];
  const result = await runSongAudioSaveSaga({
    change: { kind: 'keep' },
    currentAudioPath: 'old.mp3',
    upload: async () => {
      calls.push('upload');
      return metadata();
    },
    update: async (audio) => {
      calls.push(`update:${String(audio)}`);
      return 'saved';
    },
    deleteAudio: async () => {
      calls.push('delete');
    },
  });

  assert.equal(result, 'saved');
  assert.deepEqual(calls, ['update:undefined']);
});

test('save saga uploads before committing the new DB reference', async () => {
  const calls: string[] = [];
  await runSongAudioSaveSaga({
    change: { kind: 'replace', file: candidate() },
    upload: async () => {
      calls.push('upload');
      return metadata();
    },
    update: async () => {
      calls.push('update');
      return 'saved';
    },
    deleteAudio: async () => {
      calls.push('delete');
    },
  });

  assert.deepEqual(calls, ['upload', 'update']);
});

test('upload failure leaves the database and storage cleanup untouched', async () => {
  const calls: string[] = [];
  await assert.rejects(
    runSongAudioSaveSaga({
      change: { kind: 'replace', file: candidate() },
      upload: async () => {
        calls.push('upload');
        throw new Error('upload failed');
      },
      update: async () => {
        calls.push('update');
      },
      deleteAudio: async () => {
        calls.push('delete');
      },
    }),
  );
  assert.deepEqual(calls, ['upload']);
});

test('DB failure after upload cleans up only the new object', async () => {
  const calls: string[] = [];
  await assert.rejects(
    runSongAudioSaveSaga({
      change: { kind: 'replace', file: candidate() },
      currentAudioPath: `${SONG_ID}/33333333-3333-4333-8333-333333333333.mp3`,
      upload: async () => {
        calls.push('upload');
        return metadata();
      },
      update: async () => {
        calls.push('update-conflict');
        throw new Error('conflict');
      },
      deleteAudio: async (path) => {
        calls.push(`delete:${path}`);
      },
    }),
  );
  assert.deepEqual(calls, ['upload', 'update-conflict', `delete:${metadata().path}`]);
});

test('successful replacement cleans up old audio after DB success', async () => {
  const oldPath = `${SONG_ID}/33333333-3333-4333-8333-333333333333.mp3`;
  const calls: string[] = [];
  await runSongAudioSaveSaga({
    change: { kind: 'replace', file: candidate() },
    currentAudioPath: oldPath,
    upload: async () => {
      calls.push('upload');
      return metadata();
    },
    update: async () => {
      calls.push('update');
      return 'saved';
    },
    deleteAudio: async (path) => {
      calls.push(`delete:${path}`);
    },
  });
  assert.deepEqual(calls, ['upload', 'update', `delete:${oldPath}`]);
});

test('audio removal clears the DB before deleting the old object', async () => {
  const oldPath = `${SONG_ID}/33333333-3333-4333-8333-333333333333.mp3`;
  const calls: string[] = [];
  await runSongAudioSaveSaga({
    change: { kind: 'remove' },
    currentAudioPath: oldPath,
    upload: async () => metadata(),
    update: async (audio) => {
      assert.equal(audio, null);
      calls.push('update');
      return 'saved';
    },
    deleteAudio: async () => {
      calls.push('delete');
    },
  });
  assert.deepEqual(calls, ['update', 'delete']);
});

test('cleanup failure does not undo a successful save', async () => {
  let cleanupReported = false;
  const result = await runSongAudioSaveSaga({
    change: { kind: 'remove' },
    currentAudioPath: `${SONG_ID}/${FILE_ID}.mp3`,
    upload: async () => metadata(),
    update: async () => 'saved',
    deleteAudio: async () => {
      throw new Error('storage unavailable');
    },
    onCleanupError: () => {
      cleanupReported = true;
    },
  });
  assert.equal(result, 'saved');
  assert.equal(cleanupReported, true);
});

test('song deletion removes the DB row before best-effort storage cleanup', async () => {
  const calls: string[] = [];
  await runSongDeleteSaga({
    audioPath: `${SONG_ID}/${FILE_ID}.mp3`,
    deleteSongRow: async () => {
      calls.push('delete-row');
    },
    deleteAudio: async () => {
      calls.push('delete-audio');
    },
  });
  assert.deepEqual(calls, ['delete-row', 'delete-audio']);
});

test('player utilities format time, handle missing duration, and reset ended playback', () => {
  assert.equal(formatSongAudioTime(37.9), '0:37');
  assert.equal(formatSongAudioTime(134), '2:14');
  assert.equal(formatSongAudioTime(null), '--:--');
  assert.equal(getSongAudioDisplayPosition(134, 134, true), 0);
  assert.equal(getSongAudioDisplayPosition(200, 134, false), 134);
});
