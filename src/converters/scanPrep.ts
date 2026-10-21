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
  // A shadow down the middle (dark columns) is the gutter itself: cut through its center.
  const first = ink.findIndex((dark) => dark > height * DARK_EDGE);
  if (first >= 0) {
    let last = first;
    while (last + 1 < ink.length && ink[last + 1]! > height * DARK_EDGE) last += 1;
    return lo + Math.floor((first + last + 1) / 2);
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

/** A border row or column is dark when this share of it is ink. */
const DARK_EDGE = 0.9;
/** At most this share of each side is trimmed, so a page that is dark all over is not eaten. */
const MAX_TRIM = 0.1;

/** Drops the dark frame a flatbed leaves around a scan (and the shadow at the edge of a half sheet). */
export function trimBorders(image: Raster): Raster {
  const { data, width, height, channels } = image;
  const dark = (x: number, y: number): boolean => {
    const at = (y * width + x) * channels;
    const luma = channels >= 3 ? (data[at]! + data[at + 1]! + data[at + 2]!) / 3 : data[at]!;
    return luma < 128;
  };
  const rowDark = (y: number): boolean => {
    let ink = 0;
    for (let x = 0; x < width; x += 1) if (dark(x, y)) ink += 1;
    return ink > width * DARK_EDGE;
  };
  const colDark = (x: number): boolean => {
    let ink = 0;
    for (let y = 0; y < height; y += 1) if (dark(x, y)) ink += 1;
    return ink > height * DARK_EDGE;
  };
  const limitX = Math.floor(width * MAX_TRIM);
  const limitY = Math.floor(height * MAX_TRIM);
  let top = 0;
  let bottom = height;
  let left = 0;
  let right = width;
  while (top < limitY && rowDark(top)) top += 1;
  while (height - bottom < limitY && rowDark(bottom - 1)) bottom -= 1;
  while (left < limitX && colDark(left)) left += 1;
  while (width - right < limitX && colDark(right - 1)) right -= 1;
  if (top === 0 && left === 0 && bottom === height && right === width) return image;
  const out = new Uint8ClampedArray((right - left) * (bottom - top) * channels);
  for (let y = top; y < bottom; y += 1)
    out.set(
      data.subarray((y * width + left) * channels, (y * width + right) * channels),
      (y - top) * (right - left) * channels,
    );
  return { data: out, width: right - left, height: bottom - top, channels };
}
