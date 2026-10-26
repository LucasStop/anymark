# SDD: anymark

Rascunho de 14/10/2026, conferido contra o código em 26/10/2026. Requisitos: [PRD.md](PRD.md). Decisões e cronograma: [PLAN.md](PLAN.md). Cada decisão de arquitetura que mudar vira ADR em [adr/](adr/).

Vocabulário: módulo profundo = muito comportamento atrás de interface pequena. Seam = ponto onde se troca comportamento sem editar ali. Um adapter é seam hipotético, dois são seam real. A interface é a superfície de teste.

## Módulos

| Módulo | Interface (o que o chamador precisa saber) | Esconde | Padrão |
|---|---|---|---|
| `Anymark` | `convert(input, options)`, `use(plugin)`, `registry`. Criado por `createAnymark()`. `addSink` e decorators: planejados (#23, #24) | detecção, resolução do converter, backends, hash do conteúdo | Facade |
| `ConverterRegistry` | `register(entry)`, `resolve(format)` | carga lazy (`load()`), conflito de mime, ordem de registro | Registry/Plugin |
| `Converter` | `convert(input, ctx)` devolve `ConversionResult`; declara nome e mimes | parser e dependência do formato | Strategy |
| `FormatDetectorChain` | `detect({ data, name?, mime? })` devolve o mime ou `undefined` | dica, assinatura, ZIP/OOXML, extensão, texto estruturado, texto puro | Chain |
| `MarkdownBuilder` | `heading`, `list`, `table`, `code`, `build` | escape de pipe, aninhamento, linhas em branco | Builder |
| `Backend<In, Out>` | `capability`, `locality`, `isAvailable()`, `run(input, ctx)` | CLI, API ou WASM por trás | Adapter |
| `BackendChain` | `new BackendChain(backends, options)`, `run(capability, input)` | ordem, pulo de indisponível, opt-in, fallback, `NoBackendError` | Chain |
| `spawn` | `runCli(request, options)` (ainda sem adapter de CLI que o use) | `execFile`, diretório temporário, timeout, `signal`, `maxBuffer`, allowlist de env, limpeza | nenhum |
| `ResultSink` (planejado, #24) | `onResult(result)`, `onProgress(event)` | quem consome | Observer |

## Teste de deleção

- `Anymark`: sem ele, cada chamador refaz detecção, registry e decorators. Ganha o lugar.
- `spawn`: sem ele, cada adapter de CLI refaz timeout, limpeza e allowlist, e uma falha de segurança vira N falhas. Ganha o lugar e é o módulo mais crítico para review.
- `BackendChain`: sem ele, a lógica de fallback e opt-in vaza para cada converter de imagem e áudio. Ganha o lugar.
- `MarkdownBuilder`: sem ele, o escape de pipe se repete em csv, xlsx, pptx, json, xml, pdf e imagem (docx e html passam por mammoth e turndown, sem o builder). Ganha o lugar.
- `ConverterRegistry`: pouco código, mas é o ponto de extensão (OCP). Ganha o lugar pelo seam, não pelo tamanho.
- Decorators (front matter, chunking, retry, timeout; planejados, #23, nenhum existe ainda): envolvem `Converter` pela mesma interface, então não criam módulo novo. Cada um vale só se uma regra real justificar.

## Seams

| Seam | Adapters reais | Situação |
|---|---|---|
| `Converter` | 11 entradas de fábrica (10 formatos mais imagem) e `.srt` por plugin | real |
| `Backend` | tesseract.js, whisper-cli, Gemini, OpenAI, `claude -p`, `codex exec`, `agy -p` | real |
| Handler do `FormatDetectorChain` | dica, assinatura, ZIP/OOXML, extensão, texto estruturado, texto puro (ordem de `createDefaultDetector`) | real |
| `ResultSink` (planejado, #24) | log do exemplo e progresso da UI | hipotético até existir o segundo. Se só houver um, Observer cai para reserva |
| `spawn` | um, de propósito | não é seam de extensão, é ponto único de segurança. Teste usa CLI falso em `fixtures/bin/` |

## Fluxo

`convert(input)` entra em `Anymark`. O hash do conteúdo vira `sourceId`. O `FormatDetectorChain` devolve o formato. O `ConverterRegistry` resolve e carrega o `Converter`, (decorators planejados, #23). Imagem e áudio chamam a `BackendChain`, que chama `Backend` (hoje só o `TesseractBackend`; um backend de CLI passaria por `runCli`). O resultado vai para os `ResultSink` quando existirem (#24). Falha de backend vira warning no resultado, sem chave nem caminho.

## Contratos congelados cedo

`Input`, `ConvertOptions` (`signal`, `allowCli`, `allowNetwork`, `backends`, `lang`, `includeHidden`, `pdf`), `Source`, `Metadata` (`schemaVersion: 1`, `sourceId`), `ConversionResult`, `Converter`, `ConverterEntry`, `Backend`, `Plugin`. Surgiram ao escrever o código, porque os contratos acima não fechavam sem eles: `ConversionWarning`, `ConverterContext` (traz `sourceId`, `options` e o `BackendRunner`), `BackendRunner`, `BackendContext`, `Capability`, `Locality` e `PluginHost`. `ConverterEntry` ganhou `extensions` para o detector mapear `.srt` para um mime sem editar a lib. Código em `src/core/types.ts`. Mudança só com aval dos dois. Forma das chains: [ADR 0003](adr/0003-chain-handlers-decidem.md). `includeHidden` e `pdf` mudaram o contrato depois do congelamento: ADRs 0008 e 0009.

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
| [0007](adr/0007-ocr-padrao-no-createanymark.md) | OCR local padrão no `createAnymark()` | Stopinski |
| [0008](adr/0008-include-hidden-flag-unico.md) | `includeHidden`, flag único | Bruno |
| [0009](adr/0009-pdf-escaneado-declarado.md) | PDF escaneado declarado (`pdf`) | Stopinski |

## Aberto

- Quantos decorators entram de fato. Meta: front matter e chunking no mínimo.
- Segundo adapter de `ResultSink` para sustentar o Observer.
