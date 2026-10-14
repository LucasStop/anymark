/** No converter handles this input. The message never echoes the file name or content. */
export class UnsupportedFormatError extends Error {
  readonly code = 'UNSUPPORTED_FORMAT';

  constructor() {
    super('Unsupported format');
    this.name = 'UnsupportedFormatError';
  }
}
