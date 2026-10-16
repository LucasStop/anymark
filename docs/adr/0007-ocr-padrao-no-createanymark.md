# 0007. OCR local como backend padrão do `createAnymark()`

Status: aceita (16/10/2026). Dono: Lucas Stopinski. Muda a decisão da issue #16 ("sem backend padrão").

## Contexto

Na #16 o `createAnymark()` nasceu sem backend: converter uma imagem exigia passar `backends` em toda chamada, e sem isso saía `NoBackendError`. Para uma biblioteca de "qualquer arquivo em Markdown", imagem que falha de fábrica é um formato prometido e não entregue. A rubrica (`docs/ENUNCIADO.md`) pede só uma lib publicável; um backend local embutido não a contradiz.

## Decisão

`createAnymark()` instala um `TesseractBackend` como cadeia padrão. Os dados de idioma (`eng`) vêm do pacote `@tesseract.js-data/eng`, dependência de runtime, resolvido para uma pasta local (`langPath`). Nada toca a rede: `allowDownload` continua desligado e só vale por opt-in de quem monta o `TesseractBackend` à mão.

`ConvertOptions.backends` continua valendo por chamada e substitui a cadeia padrão (lista vazia inclusive, que volta a lançar `NoBackendError`). O construtor `Anymark` mantém `backends` explícito e vazio por padrão: o padrão mora na fábrica, não na fachada.

## Consequências

- Imagem converte sem configuração, offline. Custo: cerca de 14 MB de dados de idioma (pacote `@tesseract.js-data/eng`) no `node_modules` de quem instala a lib.
- Só inglês vem de fábrica. Outros idiomas pedem `langPath` próprio ou `allowDownload`.
- Backends de CLI e de rede (#21, #22) entram na cadeia por opt-in, depois do local.
- `Backend` (Adapter) e `Converter` (Strategy) seguem separados ([ADR 0002](0002-converter-e-backend-separados.md)).

## Alternativa descartada

Manter "sem backend padrão" e documentar `backends` no README. Mais explícito, mas a primeira chamada com uma imagem falha, e o exemplo mínimo da lib deixa de funcionar para um formato do escopo.
