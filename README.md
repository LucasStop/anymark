# anymark

Biblioteca TypeScript que converte qualquer arquivo em Markdown. Cobre texto, dados, Office e PDF; imagem (OCR) passa por backends de IA plugáveis com fallback. A saída serve a três usos: contexto para LLM/RAG, Obsidian e leitura humana.

Trabalho final de Design Patterns (PUCPR, 2026/2), feito em dupla por **Lucas Stopinski da Silva** e **Lucas Bruno e Silva**.

> Estado: parcial de 29/10/2026. Vídeo de apresentação: _link em breve_.

## Formatos

txt, md, csv, json, xml, html, docx, pptx, xlsx, pdf e, por OCR, png, jpg, gif e webp. Áudio, vídeo e URL entram na entrega final (12/11). Limites conhecidos estão em [docs/TESTING.md](docs/TESTING.md).

## Instalação

Requer Node 22 ou superior. A lib é só ESM. Ainda não está publicada no npm (prevista para depois de 29/10); por enquanto, gere o pacote a partir de um clone e instale o `.tgz` no seu projeto:

```sh
git clone https://github.com/LucasStop/anymark.git
cd anymark
npm install
npm pack                      # gera anymark-0.0.0.tgz (compila antes)
cd /caminho/do/seu/projeto
npm install /caminho/para/anymark/anymark-0.0.0.tgz
```

## Uso

```ts
import { readFile } from 'node:fs/promises';
import { createAnymark } from 'anymark';

const anymark = createAnymark();
const bytes = new Uint8Array(await readFile('relatorio.docx'));
const { markdown, metadata, warnings } = await anymark.convert({ data: bytes, name: 'relatorio.docx' });
```

`convert` aceita bytes soltos ou `{ data, name?, mime? }`; o formato é detectado pelo conteúdo e, se preciso, pelo nome. `warnings` lista problemas que não impedem a conversão, sem caminho nem dado do usuário. `metadata.sourceId` é o sha256 do conteúdo.

Formato não reconhecido lança `UnsupportedFormatError`; arquivo ilegível lança `ConversionError` (mensagens genéricas, de propósito).

### Imagem (OCR)

`createAnymark()` já traz OCR local (tesseract.js, inglês, dados embutidos), sem rede:

```ts
const { markdown } = await createAnymark().convert({ data: pngBytes, name: 'pagina.png' });
```

Para outro idioma ou outro backend, passe `backends` na chamada (substitui o padrão). `langPath` aponta para uma pasta com `<idioma>.traineddata.gz`; baixar os dados exige `allowDownload: true` no `TesseractBackend` (opt-in explícito):

```ts
import { createAnymark, TesseractBackend } from 'anymark';

const result = await createAnymark().convert(
  { data: pngBytes, name: 'pagina.png' },
  { backends: [new TesseractBackend({ langPath: './tessdata' })] },
);
```

Decisão registrada em [ADR 0007](docs/adr/0007-ocr-padrao-no-createanymark.md).

### Cancelamento

```ts
await anymark.convert(input, { signal: AbortSignal.timeout(30_000) });
```

## Estendendo: um formato novo sem tocar a lib

```ts
import { createAnymark } from 'anymark';
// srtPlugin.ts: copie examples/plugins/srt/index.ts e troque o import da lib por 'anymark'
import { srtPlugin } from './srtPlugin.js';

const anymark = createAnymark().use(srtPlugin);
```

O plugin `.srt` em `examples/plugins/srt/index.ts` é o exemplo completo. Guia para escrever converters e backends, com as regras de segurança: [docs/EXTENDING.md](docs/EXTENDING.md). Para um humano ou uma IA estender a lib, esse é o ponto de partida.

## Exemplo Next.js

`examples/nextjs` é um consumidor de demonstração: upload, preview e download do Markdown, com o plugin `.srt`. Não é um backend nem a entrega do trabalho, e não tem deploy. Veja [examples/nextjs/README.md](examples/nextjs/README.md).

## Padrões de projeto

Adapter e Chain of Responsibility (Lucas Stopinski); Strategy, Registry/Plugin e Builder (Lucas Bruno); Facade (`Anymark.convert()`). Problema, alternativa descartada e trecho de código de cada um: [docs/PATTERNS.md](docs/PATTERNS.md). Decisões de arquitetura: [docs/adr](docs/adr).

## Segurança

- Chamada de CLI e de rede só com opt-in explícito (`allowCli`, `allowNetwork`); desligadas por padrão. O download dos dados de idioma do OCR é outro opt-in, separado: `allowDownload` do `TesseractBackend` (com `cachePath` para guardar o arquivo); `allowNetwork` não o liga.
- O conteúdo de um documento é tratado como dado não confiável: nunca vai para shell nem vira instrução.
- Metadata e warnings não carregam caminho absoluto, chave nem dado do usuário.

## Desenvolvimento

```sh
npm run typecheck
npm run lint
npm test
```

Fluxo de trabalho, TDD e convenções: [AGENTS.md](AGENTS.md). Cenários de teste manual: [docs/TESTING.md](docs/TESTING.md). Plano e decisões: [docs/PLAN.md](docs/PLAN.md).

## Uso de IA

O projeto é desenvolvido com apoio de agentes de IA (Claude Code), como as diretrizes da disciplina permitem. A IA escreve código e documentação sob direção da dupla; cada mudança passa por testes escritos antes (TDD), CI e revisão de quem não escreveu. A avaliação do trabalho foca na justificativa da arquitetura, que a dupla defende no vídeo.

## Licença

MIT.
