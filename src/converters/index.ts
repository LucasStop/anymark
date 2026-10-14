import type { ConverterEntry } from '../core/types.js';

/** Built-in formats. Each loads on first use so unused parsers cost nothing. */
export const builtInEntries: readonly ConverterEntry[] = [
  {
    name: 'txt',
    mimes: ['text/plain'],
    extensions: ['.txt'],
    load: async () => new (await import('./TxtConverter.js')).TxtConverter(),
  },
];
