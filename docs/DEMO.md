# Roteiro do vídeo de defesa

Entrega final de 18/11/2026. O vídeo tem no máximo 10 minutos (Canvas) e cobre os três blocos do [ENUNCIADO](ENUNCIADO.md): visão geral, uso com extensão e defesa por padrão. Cada aluno defende 2 padrões. Os slides seguem os blocos, um por tela, com o trecho de código como conteúdo (o código é a prova, ver [PATTERNS.md](PATTERNS.md)). Marca e miniatura: `design/brand/applications/`.

Estado mostrado: pacote no npm, `main` verde, texto, dados, Office, PDF, imagem por OCR, áudio por whisper.cpp ou API, vídeo por ffmpeg, página da web e YouTube, extensão `.srt` por plugin. Só citar como pronto o que tem teste na `main`; limites conhecidos estão em [DEFESA.md](DEFESA.md).

| # | Bloco | Quem | Tempo |
|---|---|---|---|
| 1 | O que é a lib e para quê | Stopinski | 1:00 |
| 2 | Caso padrão: txt, docx, pdf, OCR | Stopinski | 1:30 |
| 3 | Extensão `.srt` sem tocar a lib | Bruno | 1:30 |
| 4 | Adapter e Chain of Responsibility | Stopinski | 2:00 |
| 5 | Strategy com Registry/Plugin, e Builder | Bruno | 2:00 |
| 6 | Facade, Decorator e Observer em uma passada | os dois | 1:30 |
| 7 | Fechamento | os dois | 0:30 |

Total: 10:00. O alvo da gravação é 9:30, para sobrar folga.

## 1. O que é a lib (Stopinski)

Uma chamada, qualquer arquivo, Markdown. Saída pensada para LLM/RAG, Obsidian e leitura humana. A nota avalia a defesa da arquitetura, não a quantidade de formatos.

## 2. Caso padrão (Stopinski)

Demo no `examples/nextjs`, porta 3000 (`yarn setup` e `yarn dev`, ver [o README do example](../examples/nextjs/README.md)): um txt, um docx, um pdf com texto e uma imagem com texto. Mostrar o Markdown e a aba de metadata (`sourceId` é o hash do conteúdo, `warnings` não traz caminho).

Plano B, sem a interface:

```ts
import { createAnymark } from 'anymark';

const { markdown, metadata, warnings } = await createAnymark().convert({ data: bytes, name: 'relatorio.docx' });
```

## 3. Extensão `.srt` (Bruno)

Mostrar que `src/` não muda: o formato entra por `createAnymark().use(srtPlugin)`. Código em `examples/plugins/srt/index.ts` e guia em [EXTENDING.md](EXTENDING.md). Sem o plugin o `.srt` sai como texto simples; com ele, um parágrafo por legenda. A legenda é dado não confiável (o plugin tira tags e neutraliza link e imagem).

## 4. Adapter e Chain (Stopinski)

- Adapter: `TesseractBackend`, `WhisperBackend`, `GeminiBackend` e `OpenAiBackend` adaptam CLI e APIs ao contrato `Backend`. Converter (formato) e Backend (capacidade) são interfaces distintas, ADR 0002.
- Chain: `FormatDetectorChain` (cada handler responde ou chama `next()`) e `BackendChain` (pula indisponível, respeita opt-in, erro vira warning).
- Fallback ao vivo: `yarn test test/BackendChain.test.ts` (backend que falha antes de um que funciona, resultado do segundo com `BACKEND_FAILED`; backends falsos, sem quota).

## 5. Strategy, Registry/Plugin e Builder (Bruno)

- Strategy: cada formato é um `Converter`; o `Anymark` escolhe pelo mime (`registry.resolve(mime)`) e chama `convert` sem saber qual é.
- Registry/Plugin: por instância, nunca global (ADR 0001); conversor carregado sob demanda (ADR 0006).
- Builder: `MarkdownBuilder` concentra o escape; os converters descrevem a estrutura.
- Alternativa descartada de cada um: `switch (mime)`, registry global, concatenação de string. Textos em [PATTERNS.md](PATTERNS.md).

## 6. Facade, Decorator e Observer (os dois)

Uma passada, com o trecho de cada um: `Anymark.convert()` esconde detecção, registry e backends (Facade); `Anymark.decorate()` empilha front matter e chunking em volta de qualquer `Converter` (Decorator); `addSink()` recebe progresso e resultado, e um sink que lança vira warning sem derrubar a conversão (Observer).

## 7. Fechamento (os dois)

Pacote público no npm, publicado por tag. Mencionar o uso de IA (Claude Code) como o README declara. Limites ditos como são: backends reais de áudio e vídeo foram testados só com CLIs falsos, e o review cruzado humano foi pequeno.

## Ensaio

Marcar cada item só depois de rodar de fato.

- [ ] Cronometrar cada bloco: total de até 10:00.
- [ ] Demo do example do zero em máquina limpa: `yarn install`, `yarn setup`, `yarn dev`, os quatro arquivos do caso padrão mais um `.srt`.
- [ ] `yarn add anymark` num projeto vazio com a versão publicada e rodar o plano B do bloco 2.
- [ ] `yarn test test/BackendChain.test.ts` ao vivo, saída legível.
- [ ] Cada um responde em voz alta "problema, onde está no código, alternativa descartada" dos seus padrões, sem consultar.
- [ ] Plano B se o Next falhar: terminal com `node scripts/manual-run.mjs` ou o plano B por código, e o PATTERNS aberto.
- [ ] Publicar no YouTube como não listado e colocar o link no README.
