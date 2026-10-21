import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { messages } from '../lib/i18n';
import { getLocale } from '../lib/locale';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata = { title: 'anymark demo' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={messages[locale].htmlLang} className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="px-4 py-8">{children}</body>
    </html>
  );
}
