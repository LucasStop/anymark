import { describe, expect, it } from 'vitest';
import { rotateClockwise } from '../src/converters/encodePng.js';

// 3 wide, 2 high:  1 2 3
//                  4 5 6
const image = {
  data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]),
  width: 3,
  height: 2,
  channels: 1 as const,
};

describe('rotateClockwise', () => {
  it.each([
    [0, 3, 2, [1, 2, 3, 4, 5, 6]],
    [90, 2, 3, [4, 1, 5, 2, 6, 3]],
    [180, 3, 2, [6, 5, 4, 3, 2, 1]],
    [270, 2, 3, [3, 6, 2, 5, 1, 4]],
    [-90, 2, 3, [3, 6, 2, 5, 1, 4]],
  ])('by %i degrees', (degrees, width, height, expected) => {
    const turned = rotateClockwise(image, degrees);

    expect([turned.width, turned.height, [...turned.data]]).toEqual([width, height, expected]);
  });

  it('keeps every channel of a pixel together', () => {
    const rgb = {
      data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]),
      width: 2,
      height: 1,
      channels: 3 as const,
    };

    expect([...rotateClockwise(rgb, 90).data]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
