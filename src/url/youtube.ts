import { SpawnError } from '../core/errors.js';
import type { ConvertOptions } from '../core/types.js';
import { runCliFile } from '../security/spawn.js';

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const TIMEOUT_MS = 10 * 60_000;

/**
 * The 11-char video id of a YouTube link, or undefined. The id is the only part of the caller's
 * string that reaches yt-dlp, so a lookalike host, credentials or a flag-shaped value never get through.
 */
export function youtubeId(link: string): string | undefined {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return undefined;
  const candidate =
    url.hostname === 'youtu.be'
      ? url.pathname.split('/')[1]
      : HOSTS.has(url.hostname)
        ? url.pathname === '/watch'
          ? url.searchParams.get('v')
          : /^\/(?:shorts|embed)\/([^/]+)/.exec(url.pathname)?.[1]
        : undefined;
  return candidate !== undefined && candidate !== null && VIDEO_ID.test(candidate)
    ? candidate
    : undefined;
}

/** Downloads the audio of one video with yt-dlp (needs `allowCli`) and returns it as wav bytes. */
export async function downloadYoutubeAudio(
  id: string,
  options: ConvertOptions,
): Promise<Uint8Array> {
  try {
    return await runCliFile(
      {
        command: process.env.ANYMARK_YTDLP ?? 'yt-dlp',
        // --no-playlist and a canonical URL after `--`: a list or a flag-shaped value cannot ride along.
        args: (_input, outputPath) => [
          '--no-playlist',
          '--no-config',
          '-x',
          '--audio-format',
          'wav',
          '-o',
          outputPath,
          '--',
          `https://www.youtube.com/watch?v=${id}`,
        ],
        input: new Uint8Array(),
        inputName: 'unused',
        outputName: 'audio.wav',
        timeoutMs: TIMEOUT_MS,
      },
      options,
    );
  } catch (error) {
    if (options.signal?.aborted === true || !(error instanceof SpawnError)) throw error;
    // yt-dlp's stderr and the link are not for the caller.
    throw new SpawnError(error.reason === 'timeout' ? 'timeout' : 'failed');
  }
}
