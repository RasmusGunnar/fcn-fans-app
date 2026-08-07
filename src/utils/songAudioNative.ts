export type SongAudioNativePlayer = {
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  replace: (source: string) => void;
};

export type SongAudioCleanupReporter = (operation: 'pause' | 'seek', error: unknown) => void;

function getErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return `${error.name}: ${error.message} ${cause ? getErrorDetails(cause) : ''}`;
}

export function isDisposedSongAudioPlayerError(error: unknown): boolean {
  const details = getErrorDetails(error);
  return (
    details.includes('NativeSharedObjectNotFoundException') ||
    details.includes(
      'Unable to find the native shared object associated with given JavaScript object',
    )
  );
}

export function pauseSongAudioForCleanup(
  player: Pick<SongAudioNativePlayer, 'pause'>,
  report: SongAudioCleanupReporter,
): boolean {
  try {
    player.pause();
    return true;
  } catch (error) {
    if (!isDisposedSongAudioPlayerError(error)) report('pause', error);
    return false;
  }
}

export async function resetSongAudioForCleanup(
  player: Pick<SongAudioNativePlayer, 'seekTo'>,
  report: SongAudioCleanupReporter,
): Promise<boolean> {
  try {
    await player.seekTo(0);
    return true;
  } catch (error) {
    if (!isDisposedSongAudioPlayerError(error)) report('seek', error);
    return false;
  }
}

export async function stopAndResetSongAudioForCleanup(
  player: Pick<SongAudioNativePlayer, 'pause' | 'seekTo'>,
  report: SongAudioCleanupReporter,
): Promise<boolean> {
  if (!pauseSongAudioForCleanup(player, report)) return false;
  return resetSongAudioForCleanup(player, report);
}

export function replaceSongAudioSource(
  player: Pick<SongAudioNativePlayer, 'replace'>,
  source: string,
): void {
  player.replace(source);
}
