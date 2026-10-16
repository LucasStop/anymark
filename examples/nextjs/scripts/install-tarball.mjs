// Packs the library at the repo root and installs the tarball here, as a consumer would.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const out = `${here}.tarball`;
// A leftover tarball from an older version would be picked up below.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync('npm', ['pack', '--pack-destination', out], { cwd: root, stdio: 'inherit' });
const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
execFileSync('npm', ['install', '--no-save', `${out}/${tgz}`], { cwd: here, stdio: 'inherit' });
