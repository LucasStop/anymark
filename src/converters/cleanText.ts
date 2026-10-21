/**
 * Joins a word the print broke at the end of a line: letter, hyphen (or the dash glyph the OCR
 * often reads in its place), line break, lowercase letter. A real compound split at the line end
 * ("guarda-\nchuva") loses its hyphen too, which is why this is opt-in.
 */
export function dehyphenate(text: string): string {
  return text.replace(/(\p{L})[-–—]\n(\p{Ll})/gu, '$1$2');
}
