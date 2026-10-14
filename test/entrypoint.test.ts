import { describe, expect, it } from 'vitest';
import * as anymark from '../src/index.js';

describe('package entry point', () => {
  it('loads as an ES module', () => {
    expect(anymark).toBeDefined();
  });
});
