import { describe, expect, it } from 'vitest';
import type { Raster } from '../src/converters/encodePng.js';
import { splitSpread, trimBorders } from '../src/converters/scanPrep.js';

/** Gray sheet, `ink` marks the columns with ink in them; everything else is white. */
function sheet(width: number, height: number, ink: (x: number) => boolean): Raster {
  const data = new Uint8ClampedArray(width * height).fill(255);
  // Ink stops short of the top and bottom rows, like text inside a page margin.
  for (let y = 4; y < height - 4; y += 1)
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

describe('splitSpread with a dark gutter', () => {
  it('cuts through the center of a shadow off the middle, only when asked', () => {
    // content on both sides leaves no blank run, and the shadow sits at columns 470-489
    const image = sheet(1000, 40, (x) => (x >= 470 && x < 490) || (x % 3 === 0 && x < 300));
    for (let y = 0; y < 40; y += 1) image.data.fill(0, y * 1000 + 470, y * 1000 + 490);

    expect(splitSpread(image, 'left', true)[0].width).toBe(480);
    expect(splitSpread(image, 'left')[0].width).not.toBe(480);
  });
});

describe('trimBorders', () => {
  it('drops the dark frame of a scan and keeps the content', () => {
    const image = sheet(200, 100, (x) => x < 12 || x >= 188 || (x > 60 && x < 140 && x % 2 === 0));
    for (let y = 0; y < 100; y += 1)
      if (y < 9 || y >= 93) image.data.fill(0, y * 200, (y + 1) * 200);

    const trimmed = trimBorders(image);

    expect(trimmed.width).toBe(176); // 12 columns off each side
    expect(trimmed.height).toBe(84); // 9 rows off the top, 7 off the bottom
    expect(trimmed.data.some((v) => v === 0)).toBe(true);
  });

  it('leaves a page without a frame as it is', () => {
    const image = sheet(200, 100, (x) => x > 60 && x < 140 && x % 2 === 0);

    expect(trimBorders(image)).toEqual(image);
  });

  it('never eats a page that is dark all over', () => {
    const trimmed = trimBorders(sheet(200, 100, () => true));

    expect(trimmed.width).toBeGreaterThan(100);
    expect(trimmed.height).toBeGreaterThan(50);
  });
});
