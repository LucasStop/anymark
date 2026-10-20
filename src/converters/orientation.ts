import type { Raster } from './encodePng.js';

/**
 * Which way the text lines of a scan run. Lines of text make the ink per row swing between line and
 * gap, while the ink per column stays even; turned sideways it is the opposite. /Rotate cannot be
 * trusted for this: scanners often leave it at 0 on sideways pages.
 */
export function textRuns(image: Raster): 'horizontal' | 'vertical' {
  const { data, width, height, channels } = image;
  const rows = new Float64Array(height);
  const cols = new Float64Array(width);
  const step = Math.max(1, Math.floor(Math.max(width, height) / 1500));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = (y * width + x) * channels;
      const luma = channels >= 3 ? (data[at]! + data[at + 1]! + data[at + 2]!) / 3 : data[at]!;
      if (luma < 128) {
        rows[y] = (rows[y] ?? 0) + 1;
        cols[x] = (cols[x] ?? 0) + 1;
      }
    }
  }
  // Both axes use the same rule, chosen by the shorter side, so their values stay comparable.
  const snippet = Math.min(width, height) / step < MIN_PAGE_SAMPLES;
  return swing(rows, step, snippet) >= swing(cols, step, snippet) ? 'horizontal' : 'vertical';
}

const MIN_PAGE_SAMPLES = 600;

/**
 * Variation of a projection profile around its own local average (window of a fifth of the
 * side, wider than a line). Dark scanner borders and shadows are slow bands; text lines are not.
 * A snippet (a page whose short side is short, like one line of text) is where there is no band to remove: plain variation.
 */
function swing(profile: Float64Array, step: number, snippet: boolean): number {
  const sampled: number[] = [];
  for (let i = 0; i < profile.length; i += step) sampled.push(profile[i] ?? 0);
  const half = Math.max(1, Math.round(sampled.length / 10));
  const around: number[] = [];
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < sampled.length; i += 1) {
    let near = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(sampled.length - 1, i + half); j += 1) {
      near += sampled[j]!;
      n += 1;
    }
    sum += sampled[i]!;
    around[i] = near / n;
  }
  const mean = sum / sampled.length;
  for (let i = 0; i < sampled.length; i += 1)
    squares += (sampled[i]! - (snippet ? mean : around[i]!)) ** 2;
  return mean === 0 ? 0 : Math.sqrt(squares / sampled.length) / mean;
}

/**
 * How much of an OCR text looks like words: lowercase or Capitalized tokens count 1, ALLCAPS of three
 * letters or more 0.5. Upside-down text reads as mixed-case junk and scores low.
 */
export function wordScore(text: string): number {
  const tokens = text.match(/\p{L}{2,}/gu) ?? [];
  if (tokens.length === 0) return 0;
  let points = 0;
  for (const token of tokens) {
    if (
      token === token.toLowerCase() ||
      token === token[0]!.toUpperCase() + token.slice(1).toLowerCase()
    )
      points += 1;
    else if (token === token.toUpperCase() && token.length >= 3) points += 0.5;
  }
  return points / tokens.length;
}
