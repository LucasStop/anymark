import type { ConverterRegistry } from '../core/ConverterRegistry.js';
import { FormatDetectorChain } from './FormatDetectorChain.js';
import {
  ExtensionHandler,
  HintHandler,
  PlainTextHandler,
  SignatureHandler,
  StructuredTextHandler,
  ZipHandler,
} from './handlers.js';

/**
 * Order matters: hint, then content that cannot lie (signature, ZIP entries),
 * then the extension, then text sniffing for what has no extension.
 */
export const createDefaultDetector = (registry: ConverterRegistry): FormatDetectorChain =>
  new FormatDetectorChain([
    new HintHandler(),
    new SignatureHandler(),
    new ZipHandler(),
    new ExtensionHandler((extension) => registry.mimeForExtension(extension)),
    new StructuredTextHandler(),
    new PlainTextHandler(),
  ]);
