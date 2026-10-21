'use client';

import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_COOKIE, type Locale } from '../lib/i18n';
import { cn } from '../lib/utils';

export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === locale}
          onClick={() => change(l)}
          className={cn(
            'min-h-10 min-w-10 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            l === locale && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {l === 'pt-BR' ? 'PT' : 'EN'}
        </button>
      ))}
    </div>
  );
}
