import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const DOCS = ['README.md', 'docs/PATTERNS.md', 'docs/EXTENDING.md'];

describe('docs only cite code that exists', () => {
  it.each(DOCS)('%s: every repo path in backticks exists', (doc) => {
    const paths = [
      ...read(doc).matchAll(/`((?:src|examples|specs|test|docs|scripts)\/[\w./-]+)`/g),
    ];

    expect(paths.length).toBeGreaterThan(0);
    for (const [, path] of paths)
      expect(existsSync(new URL(`../${path}`, import.meta.url)), path).toBe(true);
  });

  it('PATTERNS.md: every snippet line is in the file named on its first line', () => {
    const blocks = [...read('docs/PATTERNS.md').matchAll(/```ts\n\/\/ (\S+)\n([\s\S]*?)```/g)];

    expect(blocks.length).toBeGreaterThanOrEqual(5);
    for (const [, path, snippet] of blocks) {
      const source = squash(read(path!));
      for (const line of snippet!.split('\n').map(squash)) {
        if (line !== '' && line !== '// ...') expect(source, `${path}: ${line}`).toContain(line);
      }
    }
  });
});
