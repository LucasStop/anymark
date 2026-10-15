// A format added without touching the library. In your own project, import from 'anymark'.
import { MarkdownBuilder } from '../../../src/index.js';
import type { Converter, ConverterContext, Plugin, Source } from '../../../src/index.js';

const MIME = 'application/x-subrip';
const CUE_TIME = /^(\d{2}:\d{2}:\d{2})[,.]\d{3}\s*-->/;

/** Subtitles to Markdown: one paragraph per cue, led by its start time. */
class SrtConverter implements Converter {
  readonly name = 'srt';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext) {
    ctx.options.signal?.throwIfAborted();
    const text = new TextDecoder('utf-8').decode(source.data).replace(/\r\n?/g, '\n');
    const builder = new MarkdownBuilder();
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n').filter((line) => line.trim() !== '');
      const timeAt = lines.findIndex((line) => CUE_TIME.test(line));
      const start = CUE_TIME.exec(lines[timeAt] ?? '')?.[1];
      if (start === undefined) continue;
      const words = lines.slice(timeAt + 1).join(' ');
      if (words !== '') builder.paragraph(`**${start}** ${words}`);
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1 as const, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}

export const srtPlugin: Plugin = {
  name: 'srt',
  install(host) {
    host.register({
      name: 'srt',
      mimes: [MIME],
      extensions: ['.srt'],
      load: async () => new SrtConverter(),
    });
  },
};
