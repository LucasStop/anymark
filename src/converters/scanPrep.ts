import type { Raster } from './encodePng.js';

/** The gutter hides in this share of the width around the middle of the sheet. */
const GUTTER_BAND = [0.4, 0.6] as const;
/** A blank run narrower than this share of the width is a gap between letters, not a gutter. */
const MIN_GUTTER_WIDTH = 0.01;
/** A valley deeper than this share of ink per column is a gutter; otherwise the sheet is cut in half. */
const MAX_GUTTER_INK = 0.05;

function columns(image: Raster, from: number, to: number): Raster {
  const { data, width, height, channels } = image;
  const out = new Uint8ClampedArray((to - from) * height * channels);
  for (let y = 0; y < height; y += 1)
    out.set(
      data.subarray((y * width + from) * channels, (y * width + to) * channels),
      y * (to - from) * channels,
    );
  return { data: out, width: to - from, height, channels };
}

/** Column to cut a two-page sheet at: the middle of the widest blank run near the center. */
function gutterAt(image: Raster): number {
  const { data, width, height, channels } = image;
  const lo = Math.floor(width * GUTTER_BAND[0]);
  const hi = Math.ceil(width * GUTTER_BAND[1]);
  const ink: number[] = [];
  for (let x = lo; x < hi; x += 1) {
    let dark = 0;
    for (let y = 0; y < height; y += 1) {
      const at = (y * width + x) * channels;
      const luma = channels >= 3 ? (data[at]! + data[at + 1]! + data[at + 2]!) / 3 : data[at]!;
      if (luma < 128) dark += 1;
    }
    ink.push(dark);
  }
  const least = Math.min(...ink);
  if (least > height * MAX_GUTTER_INK) return Math.floor(width / 2);
  const limit = least + height * 0.002;
  let best = { start: 0, length: 0 };
  for (let i = 0; i < ink.length; i += 1) {
    if (ink[i]! > limit) continue;
    let j = i;
    while (j < ink.length && ink[j]! <= limit) j += 1;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = j;
  }
  if (best.length < width * MIN_GUTTER_WIDTH) return Math.floor(width / 2);
  return lo + best.start + Math.floor(best.length / 2);
}

/**
 * The two printed pages of a sheet scanned open, upright, in reading order: `left` binding reads the
 * left page first, `right` (right-to-left books) the right page.
 */
export function splitSpread(image: Raster, binding: 'left' | 'right'): [Raster, Raster] {
  const cut = gutterAt(image);
  const pages: [Raster, Raster] = [columns(image, 0, cut), columns(image, cut, image.width)];
  return binding === 'left' ? pages : [pages[1], pages[0]];
}
