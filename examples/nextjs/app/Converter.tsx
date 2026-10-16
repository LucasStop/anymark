'use client';

import { useActionState } from 'react';
import { convertFile, type ConvertState } from './actions';

const initial: ConvertState = { status: 'idle' };

export function Converter() {
  const [state, action, pending] = useActionState(convertFile, initial);
  // A data: URI needs no cleanup, unlike an object URL.
  const href =
    state.status === 'ok'
      ? `data:text/markdown;charset=utf-8,${encodeURIComponent(state.markdown)}`
      : undefined;

  return (
    <>
      <form action={action}>
        <input
          type="file"
          name="file"
          accept=".txt,.md,.csv,.json,.xml,.html,.docx,.pptx,.xlsx,.pdf,.srt,.png,.jpg,.jpeg,.gif,.webp"
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Converting...' : 'Convert'}
        </button>
      </form>
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ok' && (
        <section>
          {state.warnings.map((w) => (
            <p key={w} className="warning">
              {w}
            </p>
          ))}
          <a href={href} download={`${state.name}.md`}>
            Download {state.name}.md
          </a>
          <pre>{state.markdown}</pre>
        </section>
      )}
    </>
  );
}
