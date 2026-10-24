// Copy of examples/plugins/srt for a consumer: a format added without touching the library.
import { MarkdownBuilder } from 'anymark';
import type { Converter, ConverterContext, Plugin, Source } from 'anymark';

const MIME = 'application/x-subrip';
const CUE_TIME = /^(\d{2}:\d{2}:\d{2})[,.]\d{3}\s*-->/;

// Cue text is untrusted: drop tags (<i>, <font>, raw HTML) and defuse link and image syntax.
// `[^<>]*` keeps the scan linear (`[^>]*` rescans to the end for every unclosed '<'), and a '<' left
// over is escaped so it cannot start raw HTML.
// Tags are stripped until the text stops changing, so '<<b>b>' cannot rebuild a tag after one pass.
const stripTags = (text: string) => {
  let prev: string;
  do {
    prev = text;
    text = text.replace(/<[^<>]*>/g, '');
  } while (text !== prev);
  return text;
};

const plain = (text: string) =>
  stripTags(text)
    .replace(/[[\]!\\]/g, '\\$&')
    .replace(/</g, '\\<');

/** Subtitles to Markdown: one paragraph per cue, led by its start time. */
class SrtConverter implements Converter {
  readonly name = 'srt';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext) {
    ctx.options.signal?.throwIfAborted();
    const text = new TextDecoder('utf-8').decode(source.data).replace(/\r\n?/g, '\n');
    const builder = new MarkdownBuilder();
    let skipped = 0;
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n').filter((line) => line.trim() !== '');
      const timeAt = lines.findIndex((line) => CUE_TIME.test(line));
      const start = CUE_TIME.exec(lines[timeAt] ?? '')?.[1];
      if (start === undefined) continue;
      const words = plain(lines.slice(timeAt + 1).join(' ')).trim();
      if (words === '') skipped += 1;
      else builder.paragraph(`**${start}** ${words}`);
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1 as const, sourceId: ctx.sourceId, mime: MIME },
      warnings:
        skipped === 0
          ? []
          : [{ code: 'SRT_CUE_SKIPPED', message: `Skipped ${skipped} cue without text` }],
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
