'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import type { Messages } from '../lib/i18n';
import { MAX_BYTES } from '../lib/limits';
import { convertFile, type ConvertState } from './actions';

const initial: ConvertState = { status: 'idle' };
const ACCEPT =
  '.txt,.md,.csv,.json,.xml,.html,.docx,.pptx,.xlsx,.pdf,.srt,.png,.jpg,.jpeg,.gif,.webp';

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
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <form
      className="card"
      // `action={fn}` would reset the form afterwards, wiping the options and the chosen file.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setTab('markdown');
        startTransition(() => action(data));
      }}
    >
      <ol className="steps" aria-label={t.steps.join(', ')}>
        {t.steps.map((label, i) => (
          <li key={label} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="grid">
        <section className="left">
          <div
            className="drop"
            data-dragging={dragging}
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
            <input
              ref={input}
              type="file"
              name="file"
              accept={ACCEPT}
              required
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="drop-title">{file ? file.name : t.dropTitle}</p>
            <p className="muted">{file ? `${(file.size / 1024).toFixed(1)} KB` : t.dropHint}</p>
            <button type="button" className="ghost" onClick={() => input.current?.click()}>
              {t.chooseFile}
            </button>
          </div>
          {tooBig && (
            <p role="alert" className="error">
              {t.errors.tooBig}
            </p>
          )}

          <details className="options">
            <summary>{t.options}</summary>
            <label>
              {t.langHint}
              <input name="lang" placeholder="pt" maxLength={3} />
            </label>
            <label className="check">
              <input type="checkbox" name="includeHidden" /> {t.includeHidden}
            </label>
            <fieldset>
              <legend>{t.scannedPdf}</legend>
              <label>
                {t.layout}
                <select name="layout" defaultValue="single">
                  <option value="single">single</option>
                  <option value="spread">spread</option>
                </select>
              </label>
              <label>
                {t.rotation}
                <select name="rotation" defaultValue="auto">
                  <option value="auto">auto</option>
                  <option value="0">0</option>
                  <option value="90">90</option>
                  <option value="180">180</option>
                  <option value="270">270</option>
                </select>
              </label>
              <label>
                {t.binding}
                <select name="binding" defaultValue="left">
                  <option value="left">left</option>
                  <option value="right">right</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" name="trim" /> {t.trim}
              </label>
              <label className="check">
                <input type="checkbox" name="dehyphenate" /> {t.dehyphenate}
              </label>
            </fieldset>
          </details>

          <button type="submit" className="primary" disabled={pending || tooBig || !file}>
            {pending ? t.converting : t.convert}
          </button>
        </section>

        <section className="right" aria-live="polite">
          {state.status === 'error' && !pending && (
            <p role="alert" className="error">
              {state.code === 'lib' ? state.message : t.errors[state.code]}
            </p>
          )}
          {state.status === 'idle' && !pending && <p className="muted empty">{t.empty}</p>}
          {pending && <p className="muted empty">{t.reading}</p>}
          {state.status === 'ok' && !pending && (
            <>
              <div className="tabs" role="tablist">
                {(['markdown', 'metadata', 'warnings'] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                  >
                    {t.tabs[name]}
                    {name === 'warnings' &&
                      state.warnings.length > 0 &&
                      ` (${state.warnings.length})`}
                  </button>
                ))}
                <button type="button" className="ghost" onClick={download}>
                  {t.download.replace('{name}', () => state.name)}
                </button>
              </div>
              {tab === 'markdown' && <pre>{state.markdown}</pre>}
              {tab === 'metadata' && (
                <dl>
                  <dt>{t.metaMime}</dt>
                  <dd>{state.mime}</dd>
                  <dt>{t.metaSource}</dt>
                  <dd>{state.sourceId}</dd>
                  <dt>{t.metaChars}</dt>
                  <dd>{state.markdown.length}</dd>
                </dl>
              )}
              {tab === 'warnings' &&
                (state.warnings.length === 0 ? (
                  <p className="muted">{t.noWarnings}</p>
                ) : (
                  state.warnings.map((w, i) => (
                    <p key={`${i}-${w.code}`} className="warning">
                      {warningText(t, w)}
                    </p>
                  ))
                ))}
            </>
          )}
        </section>
      </div>
    </form>
  );
}
