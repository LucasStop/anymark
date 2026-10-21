import { describe, expect, it } from 'vitest';
import { dehyphenate } from '../src/converters/cleanText.js';

describe('dehyphenate', () => {
  it('joins a word split at the end of a line', () => {
    expect(dehyphenate('uma deter-\nminação clara')).toBe('uma determinação clara');
  });

  it('reads an en dash at the line end as a hyphen too', () => {
    expect(dehyphenate('respon–\nsabilidade')).toBe('responsabilidade');
  });

  it('keeps a hyphen inside a line and a dash before a capital or a number', () => {
    expect(dehyphenate('guarda-chuva e bem-vindo')).toBe('guarda-chuva e bem-vindo');
    expect(dehyphenate('a idade -\nTrês ou 12-\n34')).toBe('a idade -\nTrês ou 12-\n34');
    expect(dehyphenate('deter-\nMinação')).toBe('deter-\nMinação');
  });

  it('keeps a line break after a sentence that ends in a dash', () => {
    expect(dehyphenate('assim —\n— disse ele')).toBe('assim —\n— disse ele');
    expect(dehyphenate('ele—\nmas não')).toBe('ele—\nmas não');
  });
});
