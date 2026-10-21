'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import { MAX_BYTES } from '../lib/limits';
import { convertFile, type ConvertState } from './actions';

const initial: ConvertState = { status: 'idle' };
const ACCEPT =
  '.txt,.md,.csv,.json,.xml,.html,.docx,.pptx,.xlsx,.pdf,.srt,.png,.jpg,.jpeg,.gif,.webp';
const STEPS = ['Upload', 'Convert', 'Review'];

type Tab = 'markdown' | 'metadata' | 'warnings';

export function Converter() {
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
    URL.revokeObjectURL(url);
  };

  return (
    <form
      className="card"
      // `action={fn}` would reset the form afterwards, wiping the options and the chosen file.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <ol className="steps" aria-label="Progress">
        {STEPS.map((label, i) => (
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
            <p className="drop-title">{file ? file.name : 'Drop a document here'}</p>
            <p className="muted">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : 'docx, pdf, xlsx, srt, images... up to 10 MB'}
            </p>
            <button type="button" className="ghost" onClick={() => input.current?.click()}>
              Choose file
            </button>
          </div>
          {tooBig && (
            <p role="alert" className="error">
              File larger than 10 MB.
            </p>
          )}

          <details className="options">
            <summary>Options</summary>
            <label>
              Language
              <input name="lang" placeholder="pt" maxLength={3} />
            </label>
            <label className="check">
              <input type="checkbox" name="includeHidden" /> Include hidden sheets and slides
            </label>
            <fieldset>
              <legend>Scanned PDF</legend>
              <label>
                Layout
                <select name="layout" defaultValue="single">
                  <option value="single">single</option>
                  <option value="spread">spread</option>
                </select>
              </label>
              <label>
                Rotation
                <select name="rotation" defaultValue="auto">
                  <option value="auto">auto</option>
                  <option value="0">0</option>
                  <option value="90">90</option>
                  <option value="180">180</option>
                  <option value="270">270</option>
                </select>
              </label>
              <label>
                Binding
                <select name="binding" defaultValue="left">
                  <option value="left">left</option>
                  <option value="right">right</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" name="trim" /> Trim scanner borders
              </label>
              <label className="check">
                <input type="checkbox" name="dehyphenate" /> Join hyphenated words
              </label>
            </fieldset>
          </details>

          <button type="submit" className="primary" disabled={pending || tooBig || !file}>
            {pending ? 'Converting...' : 'Convert'}
          </button>
        </section>

        <section className="right" aria-live="polite">
          {state.status === 'error' && (
            <p role="alert" className="error">
              {state.message}
            </p>
          )}
          {state.status === 'idle' && !pending && (
            <p className="muted empty">The Markdown shows up here.</p>
          )}
          {pending && <p className="muted empty">Reading the document...</p>}
          {state.status === 'ok' && !pending && (
            <>
              <div className="tabs" role="tablist">
                {(['markdown', 'metadata', 'warnings'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    {t === 'warnings' && state.warnings.length > 0 && ` (${state.warnings.length})`}
                  </button>
                ))}
                <button type="button" className="ghost" onClick={download}>
                  Download {state.name}.md
                </button>
              </div>
              {tab === 'markdown' && <pre>{state.markdown}</pre>}
              {tab === 'metadata' && (
                <dl>
                  <dt>mime</dt>
                  <dd>{state.mime}</dd>
                  <dt>sourceId</dt>
                  <dd>{state.sourceId}</dd>
                  <dt>characters</dt>
                  <dd>{state.markdown.length}</dd>
                </dl>
              )}
              {tab === 'warnings' &&
                (state.warnings.length === 0 ? (
                  <p className="muted">No warnings.</p>
                ) : (
                  state.warnings.map((w) => (
                    <p key={w} className="warning">
                      {w}
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
