// Safe for client and server. The cookie is read on the server in lib/locale.ts.
export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const LOCALE_COOKIE = 'locale';

export const isLocale = (value: unknown): value is Locale => LOCALES.some((l) => l === value);

const en = {
  htmlLang: 'en',
  tagline:
    'Drop a file, tune the options, read the Markdown. The .srt format comes from a plugin, not from the library.',
  language: 'Language',
  steps: ['Upload', 'Convert', 'Review'],
  stepsLabel: 'Progress',
  done: 'Done',
  file: 'File',
  dropTitle: 'Drop a document here',
  dropHint: 'docx, pdf, xlsx, srt, images... up to 10 MB',
  chooseFile: 'Choose file',
  options: 'Options',
  langHint: 'Document language',
  includeHidden: 'Include hidden sheets and slides',
  scannedPdf: 'Scanned PDF',
  layout: 'Layout',
  rotation: 'Rotation',
  binding: 'Binding',
  trim: 'Trim scanner borders',
  dehyphenate: 'Join hyphenated words',
  convert: 'Convert',
  converting: 'Converting...',
  result: 'Result',
  empty: 'The Markdown shows up here.',
  reading: 'Reading the document...',
  tabs: { markdown: 'Markdown', metadata: 'Metadata', warnings: 'Warnings' },
  download: 'Download {name}.md',
  noWarnings: 'No warnings.',
  metaMime: 'mime',
  metaSource: 'sourceId',
  metaChars: 'characters',
  errors: {
    chooseFile: 'Choose a file.',
    tooBig: 'File larger than 10 MB.',
    failed: 'Conversion failed.',
  },
  warnings: {} as Record<string, string>,
};

export type Messages = typeof en;

const ptBR: Messages = {
  htmlLang: 'pt-BR',
  tagline:
    'Solte um arquivo, ajuste as opções e leia o Markdown. O formato .srt vem de um plugin, não da biblioteca.',
  language: 'Idioma',
  steps: ['Enviar', 'Converter', 'Revisar'],
  stepsLabel: 'Progresso',
  done: 'Pronto',
  file: 'Arquivo',
  dropTitle: 'Solte um documento aqui',
  dropHint: 'docx, pdf, xlsx, srt, imagens... até 10 MB',
  chooseFile: 'Escolher arquivo',
  options: 'Opções',
  langHint: 'Idioma do documento',
  includeHidden: 'Incluir planilhas e slides ocultos',
  scannedPdf: 'PDF escaneado',
  layout: 'Layout',
  rotation: 'Rotação',
  binding: 'Lombada',
  trim: 'Remover bordas do scanner',
  dehyphenate: 'Juntar palavras hifenizadas',
  convert: 'Converter',
  converting: 'Convertendo...',
  result: 'Resultado',
  empty: 'O Markdown aparece aqui.',
  reading: 'Lendo o documento...',
  tabs: { markdown: 'Markdown', metadata: 'Metadata', warnings: 'Avisos' },
  download: 'Baixar {name}.md',
  noWarnings: 'Nenhum aviso.',
  metaMime: 'mime',
  metaSource: 'sourceId',
  metaChars: 'caracteres',
  errors: {
    chooseFile: 'Escolha um arquivo.',
    tooBig: 'Arquivo maior que 10 MB.',
    failed: 'A conversão falhou.',
  },
  // `{n}` takes the first number found in the library's own message.
  warnings: {
    DOCX_MERGED_CELLS: 'Células mescladas expandidas: {n}.',
    DOCX_NESTED_TABLE: 'Tabelas aninhadas achatadas no texto da célula: {n}.',
    HIDDEN_SLIDES_SKIPPED: 'Slides ocultos ignorados: {n}.',
    PDF_NO_TEXT: 'Nenhuma página tem camada de texto; PDF escaneado precisa de OCR.',
    PDF_OCR_FAILED: 'O OCR parou por uma falha; as páginas seguintes não foram lidas.',
    PDF_OCR_SKIPPED: 'Páginas ou imagens fora do OCR pelos limites: {n}.',
    BACKEND_FAILED: 'Um backend falhou.',
  },
};

export const messages: Record<Locale, Messages> = { 'pt-BR': ptBR, en };
