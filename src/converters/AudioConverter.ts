import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';

/** Transcribes speech. Never names a provider: the backend chain decides who listens (ADR 0002). */
export class AudioConverter implements Converter {
  readonly name = 'audio';
  readonly mimes = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg'];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    const text = await ctx.backends.run<Uint8Array, string>('transcription', source.data);
    // Backends break lines at every pause; the transcript is one run of speech.
    const transcript = text.split(/\s+/).filter(Boolean).join(' ');
    const warnings: ConversionWarning[] =
      transcript === ''
        ? [{ code: 'AUDIO_NO_SPEECH', message: 'No speech was found in the audio' }]
        : [];
    return {
      markdown: transcript === '' ? '' : new MarkdownBuilder().paragraph(transcript).build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: source.mime ?? 'audio/wav' },
      warnings,
    };
  }
}
