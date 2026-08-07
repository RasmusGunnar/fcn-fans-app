export type SongAudioPlaybackOwner = symbol;

type RegisteredSongAudioPlayback = {
  owner: SongAudioPlaybackOwner;
  songId: string;
  stop: () => void;
};

const registrations = new Map<SongAudioPlaybackOwner, RegisteredSongAudioPlayback>();
let activeOwner: SongAudioPlaybackOwner | null = null;

export function registerSongAudioPlayback(
  owner: SongAudioPlaybackOwner,
  songId: string,
  stop: () => void,
): () => void {
  const registration = { owner, songId, stop };
  registrations.set(owner, registration);
  return () => {
    if (registrations.get(owner) === registration) unregisterSongAudioPlayback(owner);
  };
}

export function unregisterSongAudioPlayback(owner: SongAudioPlaybackOwner): void {
  registrations.delete(owner);
  if (activeOwner === owner) activeOwner = null;
}

export function claimSongAudioPlayback(owner: SongAudioPlaybackOwner): boolean {
  if (!registrations.has(owner)) return false;
  if (activeOwner === owner) return true;

  const previousOwner = activeOwner;
  activeOwner = null;
  if (previousOwner) registrations.get(previousOwner)?.stop();

  if (!registrations.has(owner)) return false;
  activeOwner = owner;
  return true;
}

export function releaseSongAudioPlayback(owner: SongAudioPlaybackOwner): void {
  if (activeOwner === owner) activeOwner = null;
}

export function stopActiveSongAudio(songId?: string): void {
  if (!activeOwner) return;

  const activePlayback = registrations.get(activeOwner);
  if (!activePlayback) {
    activeOwner = null;
    return;
  }
  if (songId && activePlayback.songId !== songId) return;

  activeOwner = null;
  activePlayback.stop();
}

export function teardownSongAudio(songId: string): void {
  stopActiveSongAudio(songId);

  for (const [owner, registration] of registrations) {
    if (registration.songId === songId) unregisterSongAudioPlayback(owner);
  }
}
