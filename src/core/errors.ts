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

/** A backend needs a flag the caller did not set. Names the flag, nothing about the input. */
export class OptInRequiredError extends Error {
  readonly code = 'OPT_IN_REQUIRED';

  constructor(flag: 'allowCli' | 'allowNetwork') {
    super(`${flag} is required`);
    this.name = 'OptInRequiredError';
  }
}

export type SpawnFailure = 'timeout' | 'aborted' | 'output-too-large' | 'failed';

/** A child process did not finish. The message never carries the command, paths or stderr. */
export class SpawnError extends Error {
  readonly code = 'SPAWN_FAILED';

  constructor(readonly reason: SpawnFailure) {
    super(`Child process failed: ${reason}`);
    this.name = 'SpawnError';
  }
}

/** No backend could serve a capability. Names the capability only, never an input or a failure cause. */
export class NoBackendError extends Error {
  readonly code = 'NO_BACKEND';

  constructor(capability: string) {
    super(`No backend available for ${capability}`);
    this.name = 'NoBackendError';
  }
}
