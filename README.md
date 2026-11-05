# anymark

Biblioteca TypeScript que converte qualquer arquivo em Markdown. Cobre texto, dados, Office e PDF; imagem (OCR local por padrão) e, depois, áudio e vídeo passam por backends plugáveis com fallback. A saída serve a três usos: contexto para LLM/RAG, Obsidian e leitura humana.

Trabalho final de Design Patterns (PUCPR, 2026/2), feito em dupla por **Lucas Stopinski da Silva** e **Lucas Bruno e Silva**.

> Estado: parcial de 29/10/2026. Vídeo de apresentação: _link em breve_.

## Formatos

txt, md, csv, json, xml, html, docx, pptx, xlsx, pdf e, por OCR, png, jpg, gif e webp. Áudio (wav, mp3, flac e ogg) é transcrito pelo whisper.cpp (veja "Transcrever áudio"). URL entra por `convertUrl` (veja "Converter uma página"). Vídeo (mp4, mov, webm, mkv) tem o áudio extraído pelo ffmpeg e transcrito (veja "Transcrever vídeo"). Os formatos legados `.doc`, `.ppt` e `.xls` (OLE2) não são suportados e geram `UnsupportedFormatError`: salve como `.docx`, `.pptx` ou `.xlsx`. Limites conhecidos estão em [docs/TESTING.md](docs/TESTING.md).

## Instalação

Requer Node 22 ou superior. A lib é só ESM.

```sh
yarn add anymark
```

Para testar uma mudança local, gere o pacote a partir de um clone e instale o `.tgz` no seu projeto:

```sh
git clone https://github.com/LucasStop/anymark.git
cd anymark
yarn install
yarn build && yarn pack --filename anymark.tgz   # o .yarnrc ignora scripts: sem o build o tarball sai sem dist/
cd /caminho/do/seu/projeto
yarn add file:/caminho/para/anymark/anymark.tgz
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

`createAnymark()` já traz OCR local (tesseract.js, inglês e português, dados embutidos), sem rede:

```ts
const { markdown } = await createAnymark().convert({ data: pngBytes, name: 'pagina.png' });
```

O OCR padrão traz inglês e português. Para ler português, passe `lang: 'pt'` na chamada (`createAnymark().convert(entrada, { lang: 'pt' })`); sem a dica, o idioma é inglês. Para outro idioma ou outro backend, passe `backends` na chamada (substitui o padrão). `langPath` aponta para uma pasta com `<idioma>.traineddata.gz`; baixar os dados exige `allowDownload: true` no `TesseractBackend` (opt-in explícito):

```ts
import { createAnymark, TesseractBackend } from 'anymark';

const result = await createAnymark().convert(
  { data: pngBytes, name: 'pagina.png' },
  { backends: [new TesseractBackend({ langPath: './tessdata' })] },
);
```

Decisão registrada em [ADR 0007](docs/adr/0007-ocr-padrao-no-createanymark.md).

### Conteúdo oculto

No xlsx, abas `hidden` e `veryHidden`, linhas e colunas ocultas ficam fora do Markdown e geram os warnings `HIDDEN_SHEETS_SKIPPED`, `HIDDEN_ROWS_SKIPPED` e `HIDDEN_COLUMNS_SKIPPED` com a contagem. No pptx, slides ocultos saem com `HIDDEN_SLIDES_SKIPPED`. Para incluir tudo: `convert(input, { includeHidden: true })`. Células de erro (`#DIV/0!`, `#N/A`) saem com o texto do erro. Decisão em [ADR 0008](docs/adr/0008-include-hidden-flag-unico.md).

### PDF escaneado

Página sem camada de texto é lida por OCR a partir da imagem embutida nela (a mesma cadeia de backends da seção anterior); página com texto nunca chama o backend. Sem imagem embutida, ou sem backend utilizável, a página fica vazia e o warning `PDF_NO_TEXT` avisa. Limites: 100 páginas escaneadas (sem camada de texto), 4 imagens por página e 64 MB por imagem decodificada; o que passar disso vira o warning `PDF_OCR_SKIPPED` com a contagem.

Livro escaneado em folhas duplas (duas páginas impressas por página do PDF) e com rotação conhecida: declare o tipo e a lib aplica a correção, em vez de adivinhar.

```ts
await anymark.convert(input, {
  lang: 'pt',
  pdf: { layout: 'spread', rotation: 270, binding: 'left' },
});
```

`layout: 'spread'` corta cada folha na lombada antes do OCR e entrega as duas páginas em ordem de leitura (`binding: 'right'` para livros que se leem da direita para a esquerda). `rotation` fixa (0, 90, 180, 270) gira todas as imagens sem segunda passada de OCR; `'auto'`, o padrão, acha o alto pelos pixels. `cleanup: { trim: true }` corta a moldura escura do scanner e o sombreado da lombada antes do OCR; `cleanup: { dehyphenate: true }` cola a palavra quebrada em fim de linha (`respon-` + `sabilidade`). Os dois vêm desligados. Sem `pdf`, nada muda. Decisão em [ADR 0009](docs/adr/0009-pdf-escaneado-declarado.md).

### Front matter e chunks

Decorators envolvem o converter de qualquer formato, por instância. `FrontMatterDecorator` antepõe um bloco YAML (`title`, `source`, `mime`, `sourceId`) para o Obsidian; `ChunkingDecorator` acrescenta `chunks` ao resultado, cortados por heading com `headingPath` e, em seção grande, por tamanho com sobreposição, para indexar em RAG. O primeiro registrado fica por fora.

```ts
import { createAnymark, ChunkingDecorator, FrontMatterDecorator } from 'anymark';

const anymark = createAnymark()
  .decorate((converter) => new FrontMatterDecorator(converter))
  .decorate((converter) => new ChunkingDecorator(converter, { maxChars: 1500, overlap: 150 }));

const { markdown, chunks } = await anymark.convert({ data: bytes, name: 'relatorio.docx' });
```

Cada chunk traz `index`, `headingPath` e `text`. Padrão: `maxChars` 2000, `overlap` 200. Veja [Decorator em PATTERNS](docs/PATTERNS.md).

### Observar a conversão

`addSink` registra um `ResultSink` (Observer) que recebe o progresso e o resultado de cada conversão, por instância. Os dois ganchos são opcionais; um sink que lança é pulado e o resultado ganha o warning `SINK_FAILED`. Exemplos prontos em `examples/sinks/index.ts`.

Para acompanhar só uma chamada, passe `onProgress` nas opções. PDF escaneado emite um evento `ocr` por página lida, com o total conhecido de início (`{ stage: 'ocr', current: 3, total: 40 }`); toda conversão emite `convert` de 0 para 1.

```ts
await anymark.convert(input, {
  onProgress: ({ stage, current, total }) => console.log(`${stage} ${current}/${total}`),
});
```

```ts
const anymark = createAnymark().addSink({
  onProgress: ({ stage, current, total }) => console.log(stage, current, total),
  onResult: (result) => console.log(result.markdown.length, 'caracteres'),
});
```

### Cancelamento

```ts
await anymark.convert(input, { signal: AbortSignal.timeout(30_000) });
```

### Transcrever áudio

Áudio passa pelo `WhisperBackend` (whisper.cpp), que roda um CLI local e por isso exige `allowCli`. Instale o `whisper-cli` e baixe um modelo ggml; o caminho vai em `ANYMARK_WHISPER_MODEL` (sem caminho fixo).

```ts
import { createAnymark, WhisperBackend } from 'anymark';

const result = await createAnymark().convert(
  { data: await readFile('aula.wav'), name: 'aula.wav' },
  { backends: [new WhisperBackend()], allowCli: true, lang: 'pt' },
);
```

Os provedores de API são backends `remote` e exigem `allowNetwork`: `new GeminiBackend({ capability: 'ocr' })` (ou `'transcription'`) lê `GEMINI_API_KEY`, `new OpenAiBackend()` lê `OPENAI_API_KEY`. A chave só vem de parâmetro ou variável de ambiente, viaja em header, e nunca aparece em erro, log ou resultado. Limites: Gemini cerca de 20 MB inline, OpenAI 25 MB. Ordem sugerida: `backends: [new WhisperBackend(), new GeminiBackend({ capability: 'transcription' }), new OpenAiBackend()]`.

No whisper, sem `allowCli`, sem modelo ou sem o comando no `PATH`, o backend é pulado e a conversão falha com "transcription". O áudio inteiro vai numa passada só (timeout de 10 min, teto de 200 MB).

### Transcrever vídeo

O `VideoConverter` extrai a trilha de áudio com o `ffmpeg` (16 kHz, mono) e entrega à mesma cadeia de transcrição do áudio. Precisa de `allowCli` (por causa do ffmpeg) e de um backend de transcrição; `ANYMARK_FFMPEG` troca o caminho do binário.

```ts
const result = await createAnymark().convert(
  { data: await readFile('aula.mp4'), name: 'aula.mp4' },
  { backends: [new WhisperBackend()], allowCli: true, lang: 'pt' },
);
```

O ffmpeg roda com `-protocol_whitelist file`: o contêiner não consegue mandá-lo ler playlist, URL ou outro arquivo local. Sem lotes: o vídeo inteiro vai numa passada (teto de 10 min de ffmpeg e 200 MB de áudio).

### Converter uma página

```ts
const result = await createAnymark().convertUrl('https://exemplo.com/artigo', { allowNetwork: true });
```

Só `http` e `https`, e só com `allowNetwork`. O HTML é reduzido ao artigo (Readability); sem artigo reconhecível, converte a página inteira e avisa `URL_NOT_ARTICLE`. Outros tipos (PDF, texto, JSON) vão para o converter do próprio tipo. Hosts de loopback, rede privada e link-local são recusados, inclusive em redirecionamentos; `allowPrivateHosts: true` abre a guarda para teste ou intranet. Limites: 25 MB, 5 redirecionamentos, 30 s. Desenho em [ADR 0010](docs/adr/0010-url-pela-fachada.md).

## Estendendo: um formato novo sem tocar a lib

```ts
import { createAnymark } from 'anymark';
// srtPlugin.ts: copie examples/plugins/srt/index.ts e troque o import da lib por 'anymark'
import { srtPlugin } from './srtPlugin.js';

const anymark = createAnymark().use(srtPlugin);
```

O plugin `.srt` em `examples/plugins/srt/index.ts` é o exemplo completo. Guia para escrever converters e backends, com as regras de segurança: [docs/EXTENDING.md](docs/EXTENDING.md). Para um humano ou uma IA estender a lib, esse é o ponto de partida.

## Exemplo Next.js

`examples/nextjs` é um consumidor de demonstração: upload, preview e download do Markdown, com o plugin `.srt`. Não é um backend nem a entrega do trabalho, e não tem deploy. Veja [examples/nextjs/README.md](examples/nextjs/README.md). A identidade visual da interface está em [docs/DESIGN.md](docs/DESIGN.md).

## Padrões de projeto

Adapter e Chain of Responsibility (Lucas Stopinski); Strategy, Registry/Plugin e Builder (Lucas Bruno); Facade (`Anymark.convert()`). Problema, alternativa descartada e trecho de código de cada um: [docs/PATTERNS.md](docs/PATTERNS.md). Decisões de arquitetura: [docs/adr](docs/adr).

## Segurança

- Chamada de CLI e de rede só com opt-in explícito (`allowCli`, `allowNetwork`); desligadas por padrão. O download dos dados de idioma do OCR é outro opt-in, separado: `allowDownload` do `TesseractBackend` (com `cachePath` para guardar o arquivo); `allowNetwork` não o liga.
- O conteúdo de um documento é tratado como dado não confiável: nunca vai para shell nem vira instrução.
- Metadata e warnings não carregam caminho absoluto, chave nem dado do usuário.

## Desenvolvimento

```sh
yarn typecheck
yarn lint
yarn test
```

Fluxo de trabalho, TDD e convenções: [AGENTS.md](AGENTS.md). Cenários de teste manual: [docs/TESTING.md](docs/TESTING.md). Problemas do caminho: [docs/PROBLEMAS.md](docs/PROBLEMAS.md). Plano e decisões: [docs/PLAN.md](docs/PLAN.md).

## Uso de IA

O projeto é desenvolvido com apoio de agentes de IA (Claude Code), como as diretrizes da disciplina permitem. A IA escreve código e documentação sob direção da dupla; cada mudança passa por testes escritos antes (TDD), CI e revisão de quem não escreveu. A avaliação do trabalho foca na justificativa da arquitetura, que a dupla defende no vídeo.

## Licença

MIT.
