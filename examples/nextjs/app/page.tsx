import { messages } from '../lib/i18n';
import { getLocale } from '../lib/locale';
import { Converter } from './Converter';
import { LocaleSwitch } from './LocaleSwitch';

// Explicit: the converters need Node APIs, never the edge runtime.
export const runtime = 'nodejs';

export default async function Page() {
  const locale = await getLocale();
  const t = messages[locale];
  return (
    <main>
      <div className="top">
        <h1>anymark</h1>
        <LocaleSwitch locale={locale} label={t.language} />
      </div>
      <p>{t.tagline}</p>
      <Converter t={t} />
    </main>
  );
}
