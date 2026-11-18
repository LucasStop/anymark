// Screen scenes of the video, one per block of docs/DEMO.md, so the recording needs no improvised command.
// Usage: node scripts/demo.mjs preparar | gravar [n] | <1..7> [--auto] [--pausa=5] [--sem-pausa]
// Each step waits for Enter (or a timer with --auto), so the pace follows the recording. `gravar` films the screen. `abrir` steps jump the editor to the line.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';

const log = (text = '') => process.stdout.write(`${text}\n`);

const MODEL =
  process.env.ANYMARK_WHISPER_MODEL ?? join(homedir(), 'whisper-models', 'ggml-medium.bin');
const run = (...cmd) => ({ run: cmd });
const abrir = (file, anchor) => ({ abrir: [file, anchor] });

const scenes = {
  1: {
    title: 'O que é a lib (Stopinski)',
    steps: [run('yarn', 'info', 'anymark', 'version'), run('yarn', 'info', 'anymark', 'dist-tags')],
  },
  2: {
    title: 'Caso padrão: txt, docx, pdf, OCR (Stopinski)',
    steps: [
      run('node', 'examples/demo/caso-padrao.mjs', 'specs/txt/simple.txt'),
      run('node', 'examples/demo/caso-padrao.mjs', 'specs/docx/simple.docx'),
      run('node', 'examples/demo/caso-padrao.mjs', 'specs/pdf/simple.pdf'),
      run('node', 'examples/demo/caso-padrao.mjs', 'specs/image/hello.png'),
    ],
  },
  3: {
    title: 'Extensão .srt sem tocar a lib (Bruno)',
    steps: [
      abrir('examples/plugins/srt/index.ts', 'export const srtPlugin'),
      run('node', 'examples/demo/extensao-srt.mjs'),
    ],
  },
  4: {
    title: 'Adapter e Chain of Responsibility (Stopinski)',
    steps: [
      abrir('src/core/types.ts', 'export interface Backend<'),
      abrir('src/backends/TesseractBackend.ts', 'export class TesseractBackend'),
      abrir('src/backends/WhisperBackend.ts', 'export class WhisperBackend'),
      abrir('src/backends/BackendChain.ts', 'const from = (index'),
      abrir('src/detection/FormatDetectorChain.ts', 'export interface FormatHandler'),
      abrir('src/detection/handlers.ts', 'export class SignatureHandler'),
      run('node', 'examples/fallback.mjs'),
      run('yarn', 'test', 'test/BackendChain.test.ts'),
    ],
  },
  5: {
    title: 'Strategy, Registry/Plugin e Builder (Bruno)',
    steps: [
      abrir('src/core/types.ts', 'export interface Converter {'),
      abrir('src/Anymark.ts', 'registry.resolve'),
      abrir('src/core/ConverterRegistry.ts', 'register(entry'),
      abrir('src/core/ConverterRegistry.ts', 'converter = entry.load()'),
      abrir('src/core/MarkdownBuilder.ts', 'export class MarkdownBuilder'),
      abrir('src/core/MarkdownBuilder.ts', 'const cell ='),
      run('yarn', 'test', 'test/MarkdownBuilder.test.ts', 'test/plugin.test.ts'),
    ],
  },
  6: {
    title: 'Facade, Decorator e Observer (os dois)',
    steps: [
      abrir('src/Anymark.ts', 'async convert(input'),
      abrir('src/Anymark.ts', 'reduceRight'),
      abrir('src/core/types.ts', 'export interface ResultSink'),
      run('node', 'examples/demo/passada.mjs'),
    ],
  },
  7: {
    title: 'Fechamento (os dois)',
    steps: [
      run('yarn', 'test'),
      run(
        'env',
        'ANYMARK_LIVE=1',
        `ANYMARK_WHISPER_MODEL=${MODEL}`,
        'yarn',
        'test',
        'test/live.test.ts',
      ),
    ],
  },
};

const sh = (cmd) => execFileSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });

function prepare() {
  sh(['yarn', 'build']);
  // The plugin and the sinks are TypeScript outside src/: compile them once, without type checking.
  spawnSync(
    'yarn',
    [
      'tsc',
      '--ignoreConfig',
      '--noCheck',
      '--outDir',
      '.demo',
      '--rootDir',
      '.',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--target',
      'es2023',
      'examples/plugins/srt/index.ts',
      'examples/sinks/index.ts',
    ],
    { stdio: 'inherit' },
  );
  log('pronto: dist/ e .demo/ atualizados');
}

const sleep = (seconds) => wait(seconds * 1000);

/**
 * Records to `file` until `stop()`; no audio, the voices are recorded apart. The whole main screen,
 * or only the rectangle in ANYMARK_GRAVAR_REGIAO="x,y,w,h" (the window may sit on another display).
 */
async function startRecording(file) {
  mkdirSync('gravacoes', { recursive: true });
  const region = process.env.ANYMARK_GRAVAR_REGIAO;
  const args = ['-v', '-x', ...(region ? [`-R${region}`] : []), file];
  const child = spawn('screencapture', args, { stdio: 'ignore' });
  let died = false;
  child.on('exit', () => (died = true));
  await sleep(3);
  if (died) {
    throw new Error(
      'screencapture parou: libere o terminal ou o VS Code em Ajustes > Privacidade e Segurança > Gravação de Tela',
    );
  }
  return async () => {
    await sleep(2);
    const closed = new Promise((done) => child.on('exit', done));
    child.kill('SIGINT');
    await closed;
  };
}

// mode: 'enter' waits for Enter, 'auto' holds `hold` seconds, 'none' never waits.
async function play(id, { mode, hold }) {
  const scene = scenes[id];
  const rl =
    mode === 'enter' ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  log(`\nCena ${id}: ${scene.title}\n`);
  for (const step of scene.steps) {
    if (rl !== null) await rl.question('[Enter] ');
    if (step.abrir !== undefined) {
      const [file, anchor] = step.abrir;
      const line =
        readFileSync(file, 'utf8')
          .split('\n')
          .findIndex((l) => l.includes(anchor)) + 1;
      if (line === 0) throw new Error(`âncora não encontrada em ${file}: ${anchor}`);
      log(`abrir ${file}:${line}`);
      sh(['code', '-g', `${file}:${line}`]);
    } else {
      log(`$ ${step.run.filter((p) => !p.startsWith('ANYMARK_WHISPER_MODEL=')).join(' ')}`);
      spawnSync(step.run[0], step.run.slice(1), { stdio: 'inherit' });
    }
    if (mode === 'auto') await sleep(hold);
  }
  rl?.close();
}

const [, , arg, ...rest] = process.argv;
const flags = rest.filter((a) => a.startsWith('--'));
const hold = Number(flags.find((f) => f.startsWith('--pausa='))?.slice('--pausa='.length) ?? 5);
if (arg === 'preparar') {
  prepare();
} else if (arg === 'gravar') {
  // Every scene recorded to gravacoes/cena-N.mov, paced by timers. `gravar <n>` redoes one scene.
  const ids =
    rest[0] !== undefined && scenes[rest[0]] !== undefined ? [rest[0]] : Object.keys(scenes);
  prepare();
  for (const id of ids) {
    const stop = await startRecording(`gravacoes/cena-${id}.mov`);
    try {
      await play(id, { mode: 'auto', hold });
    } finally {
      await stop();
    }
    log(`gravado: gravacoes/cena-${id}.mov`);
  }
} else if (scenes[arg] === undefined) {
  log('node scripts/demo.mjs preparar   (uma vez, antes de gravar)');
  log('node scripts/demo.mjs gravar     (todas as cenas, tela gravada em gravacoes/cena-N.mov)');
  for (const [id, scene] of Object.entries(scenes))
    log(`node scripts/demo.mjs ${id}   ${scene.title}   [--auto] [--pausa=5] [--sem-pausa]`);
} else {
  const mode = flags.includes('--auto') ? 'auto' : flags.includes('--sem-pausa') ? 'none' : 'enter';
  await play(arg, { mode, hold });
}
