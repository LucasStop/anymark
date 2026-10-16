import { Converter } from './Converter';

// Explicit: the converters need Node APIs, never the edge runtime.
export const runtime = 'nodejs';

export default function Page() {
  return (
    <main>
      <h1>anymark</h1>
      <p>Upload a file, get Markdown. The .srt format comes from a plugin, not from the library.</p>
      <Converter />
    </main>
  );
}
