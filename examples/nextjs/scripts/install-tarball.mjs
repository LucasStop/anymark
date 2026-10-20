// Packs the library at the repo root and installs the tarball here, as a consumer would.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const out = `${here}.tarball`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const tgz = `${out}/anymark.tgz`;
execFileSync('yarn', ['pack', '--filename', tgz], { cwd: root, stdio: 'inherit' });
// yarn has no `--no-save`: restore package.json after `add` so the demo stays a plain consumer.
const manifest = `${here}package.json`;
const original = readFileSync(manifest);
try {
  execFileSync('yarn', ['add', `file:${tgz}`], { cwd: here, stdio: 'inherit' });
} finally {
  writeFileSync(manifest, original);
}
