import type { ReactNode } from 'react';
import { messages } from '../lib/i18n';
import { getLocale } from '../lib/locale';
import './globals.css';

export const metadata = { title: 'anymark demo' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={messages[locale].htmlLang}>
      <body>{children}</body>
    </html>
  );
}
