'use client';

import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_COOKIE, type Locale } from '../lib/i18n';

export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div className="locale" role="group" aria-label={label}>
      {LOCALES.map((l) => (
        <button key={l} type="button" aria-pressed={l === locale} onClick={() => change(l)}>
          {l === 'pt-BR' ? 'PT' : 'EN'}
        </button>
      ))}
    </div>
  );
}
