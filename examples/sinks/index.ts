// Two Observers added without touching the library. In your own project, import from 'anymark'.
import type { ResultSink } from '../../src/index.js';

/** One line per conversion: the base name and the size, never the content or a path. */
export const logSink = (write: (line: string) => void): ResultSink => ({
  onResult: (result) =>
    write(`converted ${result.metadata.name ?? 'input'}: ${result.markdown.length} chars`),
});

/** Running totals, for a dashboard or a test. */
export const metricsSink = (): ResultSink & {
  snapshot(): { conversions: number; warnings: number; characters: number };
} => {
  const totals = { conversions: 0, warnings: 0, characters: 0 };
  return {
    onResult: (result) => {
      totals.conversions += 1;
      totals.warnings += result.warnings.length;
      totals.characters += result.markdown.length;
    },
    snapshot: () => ({ ...totals }),
  };
};
