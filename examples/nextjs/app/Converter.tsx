'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import type { Messages } from '../lib/i18n';
import { MAX_BYTES } from '../lib/limits';
import { cn } from '../lib/utils';
import { convertFile, type ConvertState } from './actions';

const initial: ConvertState = { status: 'idle' };
const ACCEPT =
  '.txt,.md,.csv,.json,.xml,.html,.docx,.pptx,.xlsx,.pdf,.srt,.png,.jpg,.jpeg,.gif,.webp';

const ANIMATED_BLOCKS = 8;

// Format icons live in the brand sprite; anything else falls back to the plain-text page.
const ICONS = new Set(['txt', 'md', 'pdf', 'docx', 'pptx', 'xlsx', 'csv', 'json', 'xml', 'html']);
const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
function iconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGES.has(ext)) return 'image';
  return ICONS.has(ext) ? ext : 'txt';
}

type Tab = 'markdown' | 'metadata' | 'warnings';

// A translation may use `{n}` for the first number in the library's own message.
function warningText(t: Messages, w: { code: string; message: string }) {
  if (!Object.hasOwn(t.warnings, w.code)) return w.message;
  const text = t.warnings[w.code]!;
  const n = /\d+/.exec(w.message)?.[0];
  // A `{n}` with no number to fill it would read "expandidas: ."; the lib's own message is better.
  if (text.includes('{n}') && n === undefined) return w.message;
  return text.replace('{n}', () => n ?? '');
}

export function Converter({ t }: { t: Messages }) {
  const [state, action, pending] = useActionState(convertFile, initial);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<Tab>('markdown');
  const [elapsed, setElapsed] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // The lib reports no progress yet (issue #121), so the bar is indeterminate and the clock is the only honest signal.
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setElapsed(0);
    };
  }, [pending]);

  const tooBig = (file?.size ?? 0) > MAX_BYTES;
  const step = state.status === 'ok' ? 2 : pending ? 1 : 0;

  // A dropped file never reaches the input by itself: copy it in so the form posts it.
  const pickFile = (f: File | undefined) => {
    if (!f || !input.current) return;
    const data = new DataTransfer();
    data.items.add(f);
    input.current.files = data.files;
    setFile(f);
  };

  // An object URL has no size ceiling, unlike a data: URI; it is revoked right after the click.
  const download = () => {
    if (state.status !== 'ok') return;
    const url = URL.createObjectURL(new Blob([state.markdown], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.name}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const field =
    'min-h-10 rounded-lg border border-border bg-muted px-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const row = 'mt-3 flex items-center justify-between gap-2 text-sm';
  const check = 'mt-3 flex min-h-10 items-center gap-2 text-sm';
  // Only the first blocks animate: a large document must not become tens of thousands of nodes.
  const parts = state.status === 'ok' ? state.markdown.split(/\n{2,}/) : [];
  const blocks = parts.slice(0, ANIMATED_BLOCKS);
  const rest = parts.slice(ANIMATED_BLOCKS).join('\n\n');
  const chip = pending ? t.reading : state.status === 'ok' ? t.done : null;

  return (
    <form
      className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card"
      // `action={fn}` would reset the form afterwards, wiping the options and the chosen file.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setTab('markdown');
        startTransition(() => action(data));
      }}
    >
      <ol className="m-0 flex list-none flex-wrap gap-6 p-0" aria-label={t.stepsLabel}>
        {t.steps.map((label, i) => {
          const s = i < step ? 'done' : i === step ? 'current' : 'todo';
          return (
            <li
              key={label}
              data-state={s}
              className={cn(
                'flex items-center gap-2',
                s === 'todo' ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full border border-border text-xs transition-colors',
                  s !== 'todo' && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {s === 'done' ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-4">
          <div
            data-dragging={dragging}
            className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted px-4 py-8 text-center transition-colors duration-150 data-[dragging=true]:border-solid data-[dragging=true]:border-primary data-[dragging=true]:bg-accent-soft"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0]);
            }}
          >
            {pending && (
              <div
                aria-hidden
                className="absolute inset-x-0 h-0.5 animate-scan bg-primary motion-reduce:hidden"
              />
            )}
            <input
              ref={input}
              type="file"
              name="file"
              accept={ACCEPT}
              required
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <svg aria-hidden className="size-8 text-primary">
                <use href={`/brand/icons.svg#i-${iconFor(file.name)}`} />
              </svg>
            )}
            <p className="m-0 font-semibold wrap-anywhere">{file ? file.name : t.dropTitle}</p>
            <p className="m-0 text-sm text-muted-foreground">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : t.dropHint}
            </p>
            <Button type="button" variant="ghost" onClick={() => input.current?.click()}>
              {t.chooseFile}
            </Button>
          </div>
          {tooBig && (
            <p role="alert" className="m-0 text-destructive">
              {t.errors.tooBig}
            </p>
          )}

          <details className="rounded-xl border border-border px-3 py-2">
            <summary className="min-h-10 cursor-pointer py-2 font-semibold">{t.options}</summary>
            <label className={row}>
              {t.langHint}
              <input name="lang" placeholder="pt" maxLength={3} className={cn(field, 'w-20')} />
            </label>
            <label className={check}>
              <input type="checkbox" name="includeHidden" className="size-4 accent-primary" />
              {t.includeHidden}
            </label>
            <fieldset className="mt-3 rounded-lg border border-border px-3 pb-3">
              <legend className="px-1 text-sm">{t.scannedPdf}</legend>
              <label className={row}>
                {t.layout}
                <select name="layout" defaultValue="single" className={field}>
                  <option value="single">single</option>
                  <option value="spread">spread</option>
                </select>
              </label>
              <label className={row}>
                {t.rotation}
                <select name="rotation" defaultValue="auto" className={field}>
                  <option value="auto">auto</option>
                  <option value="0">0</option>
                  <option value="90">90</option>
                  <option value="180">180</option>
                  <option value="270">270</option>
                </select>
              </label>
              <label className={row}>
                {t.binding}
                <select name="binding" defaultValue="left" className={field}>
                  <option value="left">left</option>
                  <option value="right">right</option>
                </select>
              </label>
              <label className={check}>
                <input type="checkbox" name="trim" className="size-4 accent-primary" /> {t.trim}
              </label>
              <label className={check}>
                <input type="checkbox" name="dehyphenate" className="size-4 accent-primary" />{' '}
                {t.dehyphenate}
              </label>
            </fieldset>
          </details>

          <Button type="submit" disabled={pending || tooBig || !file}>
            {pending ? t.converting : t.convert}
          </Button>
        </section>

        <section aria-live="polite" className="min-w-0">
          {chip && (
            <p
              role="status"
              className={cn(
                'mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
                pending ? 'bg-accent-soft text-primary' : 'bg-ok-bg text-ok',
              )}
            >
              {chip}
            </p>
          )}
          {state.status === 'error' && !pending && (
            <p role="alert" className="m-0 text-destructive">
              {state.code === 'lib' ? state.message : t.errors[state.code]}
            </p>
          )}
          {state.status === 'idle' && !pending && (
            <div className="flex flex-col items-center gap-2 py-6">
              <img src="/brand/empty.svg" alt="" width={240} height={160} className="h-auto w-60" />
              <p className="m-0 text-center text-sm text-muted-foreground">{t.empty}</p>
            </div>
          )}
          {pending && (
            <div className="py-12">
              <div
                role="progressbar"
                aria-label={t.reading}
                className="relative h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-primary motion-reduce:left-0 motion-reduce:animate-none" />
              </div>
              <p aria-hidden className="m-0 mt-3 text-center text-sm text-muted-foreground">
                {t.reading} {elapsed}s
              </p>
            </div>
          )}
          {state.status === 'ok' && !pending && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  {(['markdown', 'metadata', 'warnings'] as const).map((name) => (
                    <TabsTrigger key={name} value={name}>
                      {t.tabs[name]}
                      {name === 'warnings' &&
                        state.warnings.length > 0 &&
                        ` (${state.warnings.length})`}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Button type="button" variant="ghost" onClick={download}>
                  {t.download.replace('{name}', () => state.name)}
                </Button>
              </div>
              <TabsContent value="markdown" className="mt-3">
                <div className="flex max-h-128 flex-col gap-3 overflow-auto rounded-lg bg-muted p-4 font-mono text-[13px] leading-relaxed">
                  {blocks.map((b, i) => (
                    <pre
                      key={i}
                      style={{ animationDelay: `${i * 120}ms` }}
                      className="m-0 animate-block whitespace-pre-wrap motion-reduce:animate-none"
                    >
                      {b}
                    </pre>
                  ))}
                  {rest && <pre className="m-0 whitespace-pre-wrap">{rest}</pre>}
                </div>
              </TabsContent>
              <TabsContent value="metadata" className="mt-3">
                <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">{t.metaMime}</dt>
                  <dd className="m-0 wrap-anywhere">{state.mime}</dd>
                  <dt className="text-muted-foreground">{t.metaSource}</dt>
                  <dd className="m-0 wrap-anywhere">{state.sourceId}</dd>
                  <dt className="text-muted-foreground">{t.metaChars}</dt>
                  <dd className="m-0">{state.markdown.length}</dd>
                </dl>
              </TabsContent>
              <TabsContent value="warnings" className="mt-3">
                {state.warnings.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">{t.noWarnings}</p>
                ) : (
                  state.warnings.map((w, i) => (
                    <p
                      key={`${i}-${w.code}`}
                      className="m-0 mb-2 rounded-lg bg-warn-bg px-3 py-2 text-warn"
                    >
                      {warningText(t, w)}
                    </p>
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>
    </form>
  );
}
