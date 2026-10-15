import type { ConverterEntry } from '../core/types.js';

/** Built-in formats. Each loads on first use so unused parsers cost nothing. */
export const builtInEntries: readonly ConverterEntry[] = [
  {
    name: 'txt',
    mimes: ['text/plain'],
    extensions: ['.txt'],
    load: async () => new (await import('./TxtConverter.js')).TxtConverter(),
  },
  {
    name: 'csv',
    mimes: ['text/csv'],
    extensions: ['.csv'],
    load: async () => new (await import('./CsvConverter.js')).CsvConverter(),
  },
  {
    name: 'md',
    mimes: ['text/markdown'],
    extensions: ['.md', '.markdown'],
    load: async () => new (await import('./MdConverter.js')).MdConverter(),
  },
  {
    name: 'json',
    mimes: ['application/json'],
    extensions: ['.json'],
    load: async () => new (await import('./JsonConverter.js')).JsonConverter(),
  },
  {
    name: 'xml',
    mimes: ['application/xml'],
    extensions: ['.xml'],
    load: async () => new (await import('./XmlConverter.js')).XmlConverter(),
  },
  {
    name: 'xlsx',
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    extensions: ['.xlsx'],
    load: async () => new (await import('./XlsxConverter.js')).XlsxConverter(),
  },
  {
    name: 'html',
    mimes: ['text/html'],
    extensions: ['.html', '.htm'],
    load: async () => new (await import('./HtmlConverter.js')).HtmlConverter(),
  },
  {
    name: 'pdf',
    mimes: ['application/pdf'],
    extensions: ['.pdf'],
    load: async () => new (await import('./PdfConverter.js')).PdfConverter(),
  },
  {
    name: 'docx',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['.docx'],
    load: async () => new (await import('./DocxConverter.js')).DocxConverter(),
  },
];
