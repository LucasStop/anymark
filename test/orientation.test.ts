import { describe, expect, it } from 'vitest';
import { textRuns, wordScore } from '../src/converters/orientation.js';
import type { Raster } from '../src/converters/encodePng.js';

/** Black bars every 8 rows on white: what lines of text look like from far away. */
function lines(width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y += 1) if (y % 8 < 3) data.fill(0, y * width, (y + 1) * width);
  return { data, width, height, channels: 1 };
}

describe('scan orientation', () => {
  it('sees lines running along the rows as horizontal', () => {
    expect(textRuns(lines(200, 160))).toBe('horizontal');
  });

  it('sees the same lines turned sideways as vertical', () => {
    const image = lines(200, 160);
    const turned = new Uint8ClampedArray(image.data.length);
    for (let y = 0; y < 160; y += 1)
      for (let x = 0; x < 200; x += 1) turned[x * 160 + y] = image.data[y * 200 + x]!;
    expect(textRuns({ data: turned, width: 160, height: 200, channels: 1 })).toBe('vertical');
  });

  it('scores words above junk', () => {
    expect(wordScore('A responsabilidade nasce da injunção')).toBeGreaterThan(0.8);
    expect(wordScore('uOIsSasdOdsay oWwoo BnPeUyW')).toBeLessThan(0.4);
    expect(wordScore('')).toBe(0);
  });
});
