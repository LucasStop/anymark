/** A converter could not read its input. Names the format only, never the content or the parser's own message. */
export class ConversionError extends Error {
  readonly code = 'CONVERSION_FAILED';

  constructor(format: string) {
    super(`Could not convert ${format} content`);
    this.name = 'ConversionError';
  }
}

/** No converter handles this input. The message never echoes the file name or content. */
export class UnsupportedFormatError extends Error {
  readonly code = 'UNSUPPORTED_FORMAT';

  constructor() {
    super('Unsupported format');
    this.name = 'UnsupportedFormatError';
  }
}
