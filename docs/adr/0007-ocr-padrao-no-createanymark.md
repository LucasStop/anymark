# 0007. OCR local como backend padrão do `createAnymark()`

Status: aceita (16/10/2026). Dono: Lucas Stopinski. Muda a decisão da issue #16 ("sem backend padrão").

## Contexto

Na #16 o `createAnymark()` nasceu sem backend: converter uma imagem exigia passar `backends` em toda chamada, e sem isso saía `NoBackendError`. Para uma biblioteca de "qualquer arquivo em Markdown", imagem que falha de fábrica é um formato prometido e não entregue. A rubrica (`docs/ENUNCIADO.md`) pede só uma lib publicável; um backend local embutido não a contradiz.

## Decisão

`createAnymark()` instala um `TesseractBackend` como cadeia padrão. Os dados de idioma (`eng`) vêm do pacote `@tesseract.js-data/eng`, dependência de runtime, resolvido para uma pasta local (`langPath`). Nada toca a rede: `allowDownload` continua desligado e só vale por opt-in de quem monta o `TesseractBackend` à mão.

`ConvertOptions.backends` continua valendo por chamada e substitui a cadeia padrão (lista vazia inclusive, que volta a lançar `NoBackendError`). O construtor `Anymark` mantém `backends` explícito e vazio por padrão: o padrão mora na fábrica, não na fachada.

## Consequências

- Imagem converte sem configuração, offline. Custo: cerca de 14 MB de dados de idioma (pacote `@tesseract.js-data/eng`) no `node_modules` de quem instala a lib.
- Inglês e português vêm de fábrica (pacotes `@tesseract.js-data/eng` e `@tesseract.js-data/por`, cerca de 14 MB e 8 MB). `lang: 'pt'` escolhe o português; sem a dica vale o inglês. O `langPath` do `TesseractBackend` aceita uma lista de pastas, procuradas em ordem. Outros idiomas pedem `langPath` próprio ou `allowDownload`.
- Backends de CLI e de rede (#21, #22) entram na cadeia por opt-in, depois do local.
- `Backend` (Adapter) e `Converter` (Strategy) seguem separados ([ADR 0002](0002-converter-e-backend-separados.md)).

- O mesmo OCR atende o PDF escaneado (#66): o `PdfConverter` pede a capacidade `ocr` à cadeia para as imagens embutidas nas páginas sem texto. Nenhum converter nomeia provedor. Para ler PDF escaneado de 1 bit (fax) o motor do `PdfConverter` passou a ser o `pdfjs-dist` completo (#89), porque o pdf.js embutido no `unpdf` não carrega o decodificador wasm de CCITT e JBIG2.

## Alternativa descartada

Manter "sem backend padrão" e documentar `backends` no README. Mais explícito, mas a primeira chamada com uma imagem falha, e o exemplo mínimo da lib deixa de funcionar para um formato do escopo.
