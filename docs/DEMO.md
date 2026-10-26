# Roteiro da apresentação do parcial (29/10/2026)

Vale 30% da nota. A duração e o formato dados pelo professor não estão registrados: o roteiro abaixo soma 12 minutos e cada bloco tem tempo próprio, para cortar ou esticar sem refazer. Confirmar antes de 28/10. Os slides seguem os blocos, um por tela, com o trecho de código como conteúdo (o código é a prova, ver [PATTERNS.md](PATTERNS.md)).

Estado mostrado: `anymark@0.1.1` no npm, `main` verde, 10 formatos de texto, dados, Office e PDF, imagem por OCR, extensão `.srt` por plugin. Fora do parcial: áudio, vídeo, URL, Decorator e Observer (planejados, sem código ainda; não citar como prontos).

| # | Bloco | Quem | Tempo |
|---|---|---|---|
| 1 | O que é a lib e para quê | Stopinski | 1 min |
| 2 | Caso padrão: txt, docx, pdf, OCR | Stopinski | 2 min |
| 3 | Adapter e Chain of Responsibility, com fallback de backend | Stopinski | 3 min |
| 4 | Extensão `.srt` sem tocar a lib | Bruno | 2 min |
| 5 | Strategy, Registry/Plugin e Builder | Bruno | 3 min |
| 6 | Fechamento: estado, o que falta até 12/11 | os dois | 1 min |

## 1. O que é a lib (Stopinski, 1 min)

Uma chamada, qualquer arquivo, Markdown. Saída pensada para LLM/RAG, Obsidian e leitura humana. Trabalho final de Design Patterns; a nota avalia a defesa da arquitetura, não a quantidade de formatos.

## 2. Caso padrão (Stopinski, 2 min)

Demo ao vivo no `examples/nextjs`, porta 3000 (`yarn setup` e `yarn dev`, ver [o README do example](../examples/nextjs/README.md)). Enviar, nesta ordem: um txt, um docx, um pdf com texto e uma imagem com texto (OCR). Mostrar o Markdown e a aba de metadata (`sourceId` é o hash do conteúdo, `warnings` não traz caminho).

Plano B, sem a interface: o mesmo caso por código, com o pacote publicado.

```ts
import { createAnymark } from 'anymark';

const { markdown, metadata, warnings } = await createAnymark().convert({ data: bytes, name: 'relatorio.docx' });
```

## 3. Adapter e Chain (Stopinski, 3 min)

Problema, trecho e alternativa descartada de cada um estão em [PATTERNS.md](PATTERNS.md); usar esses trechos nos slides.

- Adapter: `TesseractBackend` adapta o `tesseract.js` ao contrato `Backend`. O `Converter` (formato) e o `Backend` (capacidade de IA) são interfaces distintas, ADR 0002. Dizer a verdade sobre o seam: hoje há um adapter só; os outros são as issues #20 a #22.
- Chain: `FormatDetectorChain` (cada handler responde ou chama `next()`) e `BackendChain` (pula indisponível, respeita opt-in, erro vira warning).
- Fallback demonstrável: o teste `hands the converter a chain built from options.backends and surfaces its warnings` em `test/BackendChain.test.ts` põe um backend que falha antes de um que funciona e mostra o resultado do segundo com o warning `BACKEND_FAILED`. Rodar ao vivo: `yarn test test/BackendChain.test.ts`.

## 4. Extensão `.srt` (Bruno, 2 min)

Mostrar que `src/` não muda: o formato entra por `createAnymark().use(srtPlugin)`. Código completo em `examples/plugins/srt/index.ts` (cerca de 70 linhas) e guia em [EXTENDING.md](EXTENDING.md).

```ts
import { createAnymark } from 'anymark';
import { srtPlugin } from './srtPlugin.js';

const anymark = createAnymark().use(srtPlugin);
```

Na demo: enviar um `.srt` no example (o plugin já vem registrado em `examples/nextjs/lib/anymark.ts`). Numa instância sem o plugin, `.srt` lança `UnsupportedFormatError`; com ele sai um parágrafo por legenda. Para mostrar o contraste ao vivo: `createAnymark().convert(...)` falha e `createAnymark().use(srtPlugin).convert(...)` funciona. O conteúdo da legenda é tratado como dado não confiável (o plugin tira tags e neutraliza link e imagem).

## 5. Strategy, Registry/Plugin e Builder (Bruno, 3 min)

- Strategy: cada formato é um `Converter`; o `Anymark` escolhe pelo mime em tempo de execução (`registry.resolve(mime)`) e chama `convert` sem saber qual é.
- Registry/Plugin: por instância, nunca global (ADR 0001); o conversor é carregado sob demanda (ADR 0006).
- Builder: `MarkdownBuilder` concentra o escape de pipe e de quebra de linha; os converters descrevem a estrutura.
- Alternativa descartada de cada um: `switch (mime)`, registry estático global, concatenação de string. Os textos estão em [PATTERNS.md](PATTERNS.md).

## 6. Fechamento (os dois, 1 min)

Pacote público no npm, publicado por tag com proveniência. Até 12/11: áudio, vídeo, URL e YouTube; Decorator e Observer; README final e vídeo de defesa. Citar Decorator e Observer só como planejados.

## Ensaio

Rodar em 28/10, depois do congelamento do escopo, com os dois. Marcar cada item só depois de rodar de fato.

- [ ] Cronometrar cada bloco e ajustar à duração real da apresentação.
- [ ] Demo do example do zero em máquina limpa: `yarn install`, `yarn setup`, `yarn dev`, e os quatro arquivos do caso padrão mais um `.srt`.
- [ ] `yarn add anymark` num projeto vazio com a versão publicada e rodar o plano B do bloco 2. (O `yarn setup` do example instala o tarball local; confirmar se a demo usa o pacote publicado ou o local e dizer qual no slide.)
- [ ] `yarn test test/BackendChain.test.ts` ao vivo, saída legível no projetor.
- [ ] Cada um responde em voz alta "problema, onde está no código, alternativa descartada" dos seus padrões, sem consultar.
- [ ] Plano B se a rede ou o Next falhar: terminal com `node scripts/manual-run.mjs` ou o plano B por código, e o PATTERNS aberto.
