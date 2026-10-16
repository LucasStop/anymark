'use client';

import { useActionState, useState } from 'react';
import { MAX_BYTES } from '../lib/limits';
import { convertFile, type ConvertState } from './actions';

const initial: ConvertState = { status: 'idle' };

export function Converter() {
  const [state, action, pending] = useActionState(convertFile, initial);
  const [tooBig, setTooBig] = useState(false);

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
    <>
      <form action={action}>
        <input
          type="file"
          name="file"
          accept=".txt,.md,.csv,.json,.xml,.html,.docx,.pptx,.xlsx,.pdf,.srt,.png,.jpg,.jpeg,.gif,.webp"
          required
          onChange={(e) => setTooBig((e.target.files?.[0]?.size ?? 0) > MAX_BYTES)}
        />
        <button type="submit" disabled={pending || tooBig}>
          {pending ? 'Converting...' : 'Convert'}
        </button>
      </form>
      {tooBig && <p role="alert">File larger than 10 MB.</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ok' && (
        <section>
          {state.warnings.map((w) => (
            <p key={w} className="warning">
              {w}
            </p>
          ))}
          <button type="button" onClick={download}>
            Download {state.name}.md
          </button>
          <pre>{state.markdown}</pre>
        </section>
      )}
    </>
  );
}
