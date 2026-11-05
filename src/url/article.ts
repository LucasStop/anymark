const MIN_CHARS = 200;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The readable article of a page as HTML, or `undefined` when nothing reads as one.
 * linkedom parses without running scripts or fetching anything; the page is data.
 */
export async function extractArticle(html: string): Promise<string | undefined> {
  const [{ parseHTML }, { Readability }] = await Promise.all([
    import('linkedom'),
    import('@mozilla/readability'),
  ]);
  const { document } = parseHTML(html);
  const article = new Readability(
    document as unknown as ConstructorParameters<typeof Readability>[0],
  ).parse();
  if (article === null || (article.textContent ?? '').trim().length < MIN_CHARS) return undefined;
  const title = (article.title ?? '').trim();
  return `${title === '' ? '' : `<h1>${escapeHtml(title)}</h1>`}${article.content ?? ''}`;
}
