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
    <main className="mx-auto max-w-248">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-bold tracking-tight">
          anymark<span className="text-primary">_</span>
        </h1>
        <LocaleSwitch locale={locale} label={t.language} />
      </div>
      <p className="mt-1 text-muted-foreground">{t.tagline}</p>
      <Converter t={t} />
    </main>
  );
}
