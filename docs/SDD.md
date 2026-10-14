# SDD: anymark

Rascunho de 14/10/2026. Requisitos: [PRD.md](PRD.md). Decisões e cronograma: [PLAN.md](PLAN.md). Cada decisão de arquitetura que mudar vira ADR em [adr/](adr/).

Vocabulário: módulo profundo = muito comportamento atrás de interface pequena. Seam = ponto onde se troca comportamento sem editar ali. Um adapter é seam hipotético, dois são seam real. A interface é a superfície de teste.

## Módulos

| Módulo | Interface (o que o chamador precisa saber) | Esconde | Padrão |
|---|---|---|---|
| `Anymark` | `convert(input, options)`, `use(plugin)`, `addSink(sink)`. Criado por `createAnymark()` | detecção, resolução do converter, decorators, backends, sinks, hash do conteúdo | Facade |
| `ConverterRegistry` | `register(entry)`, `resolve(format)` | carga lazy (`load()`), conflito de mime, ordem de registro | Registry/Plugin |
| `Converter` | `convert(input, ctx)` devolve `ConversionResult`; declara nome e mimes | parser e dependência do formato | Strategy |
| `FormatDetectorChain` | `detect({ data, name?, mime? })` devolve o mime ou `undefined` | assinatura, ZIP/OOXML, sniff de texto, extensão | Chain |
| `MarkdownBuilder` | `heading`, `list`, `table`, `code`, `build` | escape de pipe, aninhamento, linhas em branco | Builder |
| `Backend<In, Out>` | `capability`, `locality`, `isAvailable()`, `run(input, ctx)` | CLI, API ou WASM por trás | Adapter |
| `BackendChain` | `run(capability, input, options)` | ordem, pulo de indisponível, opt-in, fallback, `NoBackendError` | Chain |
| `spawn` | `runProcess(cmd, args, input, limits)` | `execFile`, diretório temporário, timeout, `signal`, `maxBuffer`, allowlist de env, limpeza | nenhum |
| `ResultSink` | `onResult(result)`, `onProgress(event)` | quem consome | Observer |

## Teste de deleção

- `Anymark`: sem ele, cada chamador refaz detecção, registry e decorators. Ganha o lugar.
- `spawn`: sem ele, cada adapter de CLI refaz timeout, limpeza e allowlist, e uma falha de segurança vira N falhas. Ganha o lugar e é o módulo mais crítico para review.
- `BackendChain`: sem ele, a lógica de fallback e opt-in vaza para cada converter de imagem e áudio. Ganha o lugar.
- `MarkdownBuilder`: sem ele, o escape de pipe se repete em csv, xlsx, docx e pptx. Ganha o lugar.
- `ConverterRegistry`: pouco código, mas é o ponto de extensão (OCP). Ganha o lugar pelo seam, não pelo tamanho.
- Decorators (front matter, chunking, retry, timeout): envolvem `Converter` pela mesma interface, então não criam módulo novo. Cada um vale só se uma regra real justificar.

## Seams

| Seam | Adapters reais | Situação |
|---|---|---|
| `Converter` | 10 formatos de fábrica mais `.srt` | real |
| `Backend` | tesseract.js, whisper-cli, Gemini, OpenAI, `claude -p`, `codex exec`, `agy -p` | real |
| Handler do `FormatDetectorChain` | assinatura, OOXML, sniff, extensão | real |
| `ResultSink` | log do exemplo e progresso da UI | hipotético até existir o segundo. Se só houver um, Observer cai para reserva |
| `spawn` | um, de propósito | não é seam de extensão, é ponto único de segurança. Teste usa CLI falso em `fixtures/bin/` |

## Fluxo

`convert(input)` entra em `Anymark`. O hash do conteúdo vira `sourceId`. O `FormatDetectorChain` devolve o formato. O `ConverterRegistry` resolve e carrega o `Converter`, envolto nos decorators ativos. Imagem e áudio chamam a `BackendChain`, que chama `Backend`, que em CLI passa por `spawn`. O resultado vai para os `ResultSink`. Falha de backend vira warning no resultado, sem chave nem caminho.

## Contratos congelados cedo

`Input`, `ConvertOptions` (`signal`, `allowCli`, `allowNetwork`, `backends`, `lang`), `Source`, `Metadata` (`schemaVersion: 1`, `sourceId`), `ConversionResult`, `Converter`, `ConverterEntry`, `Backend`, `Plugin`. Surgiram ao escrever o código, porque os contratos acima não fechavam sem eles: `ConversionWarning`, `ConverterContext` (traz `sourceId`, `options` e o `BackendRunner`), `BackendRunner`, `BackendContext`, `Capability`, `Locality` e `PluginHost`. `ConverterEntry` ganhou `extensions` para o detector mapear `.srt` para um mime sem editar a lib. Código em `src/core/types.ts`. Mudança só com aval dos dois. Decisão de forma: [ADR 0003](adr/0003-chain-handlers-decidem.md).

## Testes

Seams de teste confirmados em 14/10: `convert()` ponta a ponta, kit de contrato `Converter`, kit de contrato `Backend` com CLI falso, `FormatDetectorChain`, `BackendChain` com backends falsos e plugin `.srt` sem alterar `src/`. Golden files em `specs/`. Chamada real só com `ANYMARK_LIVE=1`.

## ADRs

| # | Decisão | Dono |
|---|---|---|
| [0001](adr/0001-registry-por-instancia.md) | Registry por instância, sem global | Bruno |
| [0002](adr/0002-converter-e-backend-separados.md) | `Converter` e `Backend` são interfaces distintas | Stopinski |
| [0003](adr/0003-chain-handlers-decidem.md) | Chain: cada handler decide "trato ou passo adiante" | Stopinski |
| [0004](adr/0004-esm-only-node-22.md) | ESM-only, Node 22 ou mais, TypeScript `~6.0`, `tsc` | Stopinski |
| [0005](adr/0005-opt-in-e-spawn-unico.md) | Opt-in de CLI e rede, e `spawn` único | Stopinski |
| [0006](adr/0006-converter-lazy-por-plugin.md) | Converter carregado sob demanda e extensão por plugin | Bruno |

## Aberto

- Quantos decorators entram de fato. Meta: front matter e chunking no mínimo.
- Segundo adapter de `ResultSink` para sustentar o Observer.
