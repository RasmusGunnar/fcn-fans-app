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
import {
  pauseSongAudioForCleanup,
  replaceSongAudioSource,
  resetSongAudioForCleanup,
  stopAndResetSongAudioForCleanup,
} from '../songAudioNative';
import {
  claimSongAudioPlayback,
  registerSongAudioPlayback,
  stopActiveSongAudio,
  teardownSongAudio,
  unregisterSongAudioPlayback,
} from '../songAudioPlayback';

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

test('unregister removes the owner so a later global stop is a no-op', () => {
  const owner = Symbol('unmounted');
  const calls: string[] = [];

  registerSongAudioPlayback(owner, 'song-unmounted', () => calls.push('stop'));
  assert.equal(claimSongAudioPlayback(owner), true);
  unregisterSongAudioPlayback(owner);
  stopActiveSongAudio();

  assert.deepEqual(calls, []);
});

test('claiming owner B stops registered owner A exactly once', () => {
  const firstOwner = Symbol('first');
  const secondOwner = Symbol('second');
  const calls: string[] = [];

  registerSongAudioPlayback(firstOwner, 'song-1', () => calls.push('stop-first'));
  registerSongAudioPlayback(secondOwner, 'song-2', () => calls.push('stop-second'));
  assert.equal(claimSongAudioPlayback(firstOwner), true);
  assert.equal(claimSongAudioPlayback(secondOwner), true);
  assert.deepEqual(calls, ['stop-first']);

  teardownSongAudio('song-1');
  teardownSongAudio('song-2');
  assert.deepEqual(calls, ['stop-first', 'stop-second']);
});

test('an unregistered owner A is never stopped when owner B replaces it', () => {
  const firstOwner = Symbol('first-unregistered');
  const secondOwner = Symbol('second-active');
  const calls: string[] = [];

  registerSongAudioPlayback(firstOwner, 'song-a', () => calls.push('stale-stop'));
  assert.equal(claimSongAudioPlayback(firstOwner), true);
  unregisterSongAudioPlayback(firstOwner);
  registerSongAudioPlayback(secondOwner, 'song-b', () => calls.push('stop-b'));
  assert.equal(claimSongAudioPlayback(secondOwner), true);
  stopActiveSongAudio();

  assert.deepEqual(calls, ['stop-b']);
  unregisterSongAudioPlayback(secondOwner);
});

test('remove audio stops active playback, unregisters it, and tolerates duplicate cleanup', () => {
  const owner = Symbol('remove-active');
  const calls: string[] = [];

  registerSongAudioPlayback(owner, 'song-remove', () => calls.push('stop-remove'));
  assert.equal(claimSongAudioPlayback(owner), true);
  teardownSongAudio('song-remove');
  teardownSongAudio('song-remove');
  stopActiveSongAudio('song-remove');

  assert.deepEqual(calls, ['stop-remove']);
});

test('background stop after unmount cannot call the disposed player callback', () => {
  const owner = Symbol('background-after-unmount');
  const calls: string[] = [];
  const unregister = registerSongAudioPlayback(owner, 'song-background', () =>
    calls.push('stale-pause'),
  );

  assert.equal(claimSongAudioPlayback(owner), true);
  unregister();
  stopActiveSongAudio();

  assert.deepEqual(calls, []);
});

test('replace source unregisters the old owner before the new owner becomes active', () => {
  const oldOwner = Symbol('old-source');
  const newOwner = Symbol('new-source');
  const calls: string[] = [];

  registerSongAudioPlayback(oldOwner, 'song-replace', () => calls.push('stop-old'));
  assert.equal(claimSongAudioPlayback(oldOwner), true);
  teardownSongAudio('song-replace');
  registerSongAudioPlayback(newOwner, 'song-replace', () => calls.push('stop-new'));
  assert.equal(claimSongAudioPlayback(newOwner), true);
  stopActiveSongAudio('song-replace');

  assert.deepEqual(calls, ['stop-old', 'stop-new']);
  unregisterSongAudioPlayback(newOwner);
});

test('cleanup wrappers ignore only disposed native shared-object failures', async () => {
  const cause = new Error(
    'Unable to find the native shared object associated with given JavaScript object',
  );
  cause.name = 'NativeSharedObjectNotFoundException';
  const disposedError = new Error("Calling the 'pause' function has failed") as Error & {
    cause?: unknown;
  };
  disposedError.cause = cause;
  const reports: string[] = [];
  const report = (operation: 'pause' | 'seek') => reports.push(operation);
  let staleSeekCalls = 0;

  assert.equal(
    await stopAndResetSongAudioForCleanup(
      {
        pause: () => {
          throw disposedError;
        },
        seekTo: async () => {
          staleSeekCalls += 1;
        },
      },
      report,
    ),
    false,
  );
  assert.equal(staleSeekCalls, 0);
  assert.equal(
    await resetSongAudioForCleanup({ seekTo: async () => Promise.reject(disposedError) }, report),
    false,
  );
  assert.deepEqual(reports, []);

  const ordinaryError = new Error('audio session unavailable');
  pauseSongAudioForCleanup(
    {
      pause: () => {
        throw ordinaryError;
      },
    },
    report,
  );
  assert.deepEqual(reports, ['pause']);
});

test('source replacement calls the current player and does not hide ordinary errors', () => {
  const sources: string[] = [];
  replaceSongAudioSource({ replace: (source) => sources.push(source) }, 'new-audio.mp3');
  assert.deepEqual(sources, ['new-audio.mp3']);

  assert.throws(
    () =>
      replaceSongAudioSource(
        {
          replace: () => {
            throw new Error('replace failed');
          },
        },
        'broken-audio.mp3',
      ),
    /replace failed/,
  );
});
