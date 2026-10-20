import { describe, expect, it } from 'vitest';
import type { Raster } from '../src/converters/encodePng.js';
import { splitSpread } from '../src/converters/scanPrep.js';

/** Gray sheet, `ink` marks the dark columns; everything else is white. */
function sheet(width: number, height: number, ink: (x: number) => boolean): Raster {
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) if (ink(x)) data[y * width + x] = 0;
  return { data, width, height, channels: 1 };
}

describe('splitSpread', () => {
  it('cuts in the middle of the blank gutter, not at the middle of the sheet', () => {
    const image = sheet(1000, 40, (x) => (x < 450 || x > 560 ? x % 3 === 0 : false));

    const [left, right] = splitSpread(image, 'left');

    expect(left.width).toBeGreaterThan(490);
    expect(left.width).toBeLessThan(520);
    expect(left.width + right.width).toBe(1000);
  });

  it('follows a gutter that is off the center', () => {
    const image = sheet(1000, 40, (x) => (x < 410 || x > 470 ? x % 3 === 0 : false));

    const [left] = splitSpread(image, 'left');

    expect(left.width).toBeGreaterThan(430);
    expect(left.width).toBeLessThan(450);
  });

  it('cuts at the middle when no blank valley exists', () => {
    const image = sheet(1000, 40, (x) => x % 2 === 0);

    const [left, right] = splitSpread(image, 'left');

    expect(left.width).toBe(500);
    expect(right.width).toBe(500);
  });

  it('puts the right page first for a right binding', () => {
    const image = sheet(1000, 40, (x) => x > 700 && x % 2 === 0);

    const [first] = splitSpread(image, 'right');

    expect(first.data.some((v) => v === 0)).toBe(true); // the inked right page
    expect(splitSpread(image, 'left')[0].data.some((v) => v === 0)).toBe(false);
  });
});
