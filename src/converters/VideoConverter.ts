import { SpawnError } from '../core/errors.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { runCliFile } from '../security/spawn.js';
import { AudioConverter } from './AudioConverter.js';

const TIMEOUT_MS = 10 * 60_000;

/** Takes the sound track out with ffmpeg and hands it to the audio path. Never names a transcription provider. */
export class VideoConverter implements Converter {
  readonly name = 'video';
  readonly mimes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    const wav = await this.#extractAudio(source.data, ctx);
    const audio = await new AudioConverter().convert({ data: wav, mime: 'audio/wav' }, ctx);
    return { ...audio, metadata: { ...audio.metadata, mime: source.mime ?? 'video/mp4' } };
  }

  async #extractAudio(input: Uint8Array, ctx: ConverterContext): Promise<Uint8Array> {
    try {
      return await runCliFile(
        {
          command: process.env.ANYMARK_FFMPEG ?? 'ffmpeg',
          // -protocol_whitelist file: a container can point at playlists, URLs or other local files;
          // only the one copied into the temp dir may be read. 16 kHz mono PCM is what whisper takes.
          args: (inputPath, outputPath) => [
            '-nostdin',
            '-y',
            '-protocol_whitelist',
            'file',
            '-i',
            inputPath,
            '-vn',
            '-ar',
            '16000',
            '-ac',
            '1',
            '-c:a',
            'pcm_s16le',
            outputPath,
          ],
          input,
          inputName: 'video',
          outputName: 'audio.wav',
          timeoutMs: TIMEOUT_MS,
        },
        ctx.options,
      );
    } catch (error) {
      if (ctx.options.signal?.aborted === true || !(error instanceof SpawnError)) throw error;
      // ffmpeg's stderr and the input path are not for the caller.
      throw new SpawnError(error.reason === 'timeout' ? 'timeout' : 'failed');
    }
  }
}
