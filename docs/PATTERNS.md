# Padrões de projeto

Cada padrão abaixo traz o problema que resolve, onde está no código, um trecho real, a alternativa descartada e por que o padrão serve. Os trechos são conferidos por `test/docs-references.test.ts`: se o código mudar e o trecho não, o teste falha. A primeira linha de cada bloco é o arquivo de onde ele vem.

| Padrão | Dono | Onde |
|---|---|---|
| Adapter | Lucas Stopinski | `src/backends/TesseractBackend.ts` |
| Chain of Responsibility | Lucas Stopinski | `src/backends/BackendChain.ts`, `src/detection/FormatDetectorChain.ts` |
| Strategy | Lucas Bruno | `src/core/types.ts`, `src/converters/` |
| Registry/Plugin | Lucas Bruno | `src/core/ConverterRegistry.ts`, `examples/plugins/srt/index.ts` |
| Builder | Lucas Bruno | `src/core/MarkdownBuilder.ts` |
| Facade | dupla | `src/Anymark.ts` |

`Converter` (Strategy) e `Backend` (Adapter) são interfaces distintas, de propósito: ver [ADR 0002](adr/0002-converter-e-backend-separados.md). Decorator (front matter, chunking) e Observer (`ResultSink`) estão planejados para a segunda entrega (issues #23 e #24) e ainda não têm código, então não são defendidos aqui.

## Adapter (Lucas Stopinski)

**Problema.** Provedores de IA têm interfaces incompatíveis: tesseract.js é WASM com `createWorker`, `claude -p` é um CLI com flags, Gemini é uma API HTTP. O restante da lib não pode saber disso. Hoje só o adapter do tesseract existe; os de Gemini e `claude -p` são as issues #21 e #22.

**Onde.** `Backend` em `src/core/types.ts` é o contrato; cada provedor é um adapter. O primeiro é o `TesseractBackend` em `src/backends/TesseractBackend.ts`.

```ts
// src/core/types.ts
export interface Backend<In = unknown, Out = unknown> {
  readonly name: string;
  readonly capability: Capability;
  readonly locality: Locality;
  isAvailable(): Promise<boolean>;
  run(input: In, ctx: BackendContext): Promise<Out>;
}
```

```ts
// src/backends/TesseractBackend.ts
export class TesseractBackend implements Backend<Uint8Array, string> {
  readonly name = 'tesseract';
  readonly capability = 'ocr' as const;
  readonly locality = 'local' as const;
```

O Adapter está em `run`: a chamada do `tesseract.js` (`createWorker`, `recognize`) vira o contrato `Backend`.

```ts
// src/backends/TesseractBackend.ts
  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    const { createWorker } = await import('tesseract.js');
      const { data } = await worker.recognize(Buffer.from(input));
```

**Alternativa descartada.** Um `if/else` por provedor dentro do converter de imagem. Menos tipos no começo, mas cada provedor novo obriga a editar o converter (viola aberto/fechado) e mistura duas razões para mudar.

**Por que Adapter.** O converter de imagem pede `ocr` e recebe texto; trocar tesseract por Gemini não toca nele. `locality` (`local`, `cli`, `remote`) deixa a lib negar CLI e rede por padrão.

## Chain of Responsibility (Lucas Stopinski)

**Problema.** Tentar vários backends em ordem, pular o indisponível, cair no próximo quando um falha. Detectar o formato por vários critérios (assinatura, ZIP/OOXML, texto, extensão), onde o primeiro que reconhece encerra.

**Onde.** `src/backends/BackendChain.ts` (cada `BackendHandler` decide "trato ou passo adiante") e `src/detection/FormatDetectorChain.ts` ([ADR 0003](adr/0003-chain-handlers-decidem.md)).

```ts
// src/backends/BackendChain.ts
if (backend.capability !== capability || !isOptedIn(backend.locality, options)) return next();
const available = await isAvailable(backend);
```

```ts
// src/backends/BackendChain.ts
const from = (index: number): Promise<Out> => {
  const handler = this.#handlers[index];
  if (handler === undefined) return Promise.reject(new NoBackendError(capability));
  return handler.handle(capability, input, () => from(index + 1));
};
```

```ts
// src/detection/FormatDetectorChain.ts
export interface FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined;
}
```

Um handler decide "trato ou passo adiante": responde com o mime ou chama `next()`.

```ts
// src/detection/handlers.ts
export class SignatureHandler implements FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    const known = SIGNATURES.find((signature) => startsWith(input.data, signature.bytes));
    if (known !== undefined) return known.mime;
```

```ts
// src/detection/FormatDetectorChain.ts
    const from = (index: number): string | undefined => {
      const handler = this.#handlers[index];
      return handler?.handle(input, () => from(index + 1));
    };
```

**Alternativa descartada.** Um laço `for` sobre um array com `if` dentro, ou a lista clássica de sucessores em que cada elo guarda uma referência ao próximo. O laço é mais curto, mas deixa de ser extensível sem editar o laço, e a decisão de quem trata fica fora de quem conhece o caso. A cadeia aqui nunca inspeciona o elo: cada handler decide e, se não trata, chama `next()`. O encadeamento por closure (`() => from(index + 1)`) é a forma "middleware" do mesmo padrão.

**Por que Chain.** Cada elo conhece só a própria regra (opt-in, disponibilidade, falha) e o próximo. Acrescentar um backend ou um detector é acrescentar um elo.

## Strategy (Lucas Bruno)

**Problema.** Cada formato converte de um jeito. Um `switch (mime)` gigante acopla todos os parsers e carrega todas as dependências juntas.

**Onde.** A interface `Converter` em `src/core/types.ts`; uma classe por formato em `src/converters/` (`PdfConverter`, `DocxConverter`, ...).

```ts
// src/core/types.ts
export interface Converter {
  readonly name: string;
  readonly mimes: readonly string[];
  convert(source: Source, ctx: ConverterContext): Promise<ConversionResult>;
}
```

Cada formato é uma estratégia; o `Anymark` escolhe uma em tempo de execução, pelo mime, e a usa sem saber qual é.

```ts
// src/converters/PdfConverter.ts
export class PdfConverter implements Converter {
```

```ts
// src/Anymark.ts
const converter = mime === undefined ? undefined : await this.registry.resolve(mime);
const result = await converter.convert(source, { sourceId, options, backends });
```

**Alternativa descartada.** `switch (mime)` numa função. Funciona para três formatos; para dez, cada formato novo edita a função e todos os testes passam por ela.

**Por que Strategy.** O algoritmo varia por formato e é escolhido em tempo de execução pelo mime detectado. Uma classe por formato mantém cada parser testável sozinho (kit `anymark/testing`).

## Registry/Plugin (Lucas Bruno)

**Problema.** Adicionar um formato sem editar a lib, e não pagar o custo de dependências pesadas (pdf.js, mammoth) para quem só usa csv.

**Onde.** `ConverterRegistry` em `src/core/ConverterRegistry.ts`; um registry por instância, nunca global ([ADR 0001](adr/0001-registry-por-instancia.md)); `load()` carrega o converter na primeira vez que é pedido ([ADR 0006](adr/0006-converter-lazy-por-plugin.md)). O plugin de exemplo `examples/plugins/srt/index.ts` adiciona `.srt` de fora.

```ts
// src/core/ConverterRegistry.ts
register(entry: ConverterEntry): void {
  for (const mime of entry.mimes) this.#byMime.set(mime, entry);
```

```ts
// src/core/ConverterRegistry.ts
converter = entry.load();
this.#loaded.set(entry, converter);
```

```ts
// examples/plugins/srt/index.ts
export const srtPlugin: Plugin = {
  name: 'srt',
  install(host) {
    host.register({
      name: 'srt',
      mimes: [MIME],
      extensions: ['.srt'],
      load: async () => new SrtConverter(),
    });
  },
};
```

**Alternativa descartada.** Registry estático global. Mais simples de importar, mas duas instâncias compartilham estado, um teste contamina o outro e um plugin vira efeito colateral de `import`.

**Por que Registry/Plugin.** `createAnymark().use(plugin)` estende uma instância sem tocar `src/`. O example `examples/nextjs` registra `.srt` assim.

## Builder (Lucas Bruno)

**Problema.** Escapar pipe em célula de tabela, aninhar listas e separar blocos é frágil se cada converter concatena strings de Markdown.

**Onde.** `MarkdownBuilder` em `src/core/MarkdownBuilder.ts`. Os converters que montam Markdown à mão (csv, xlsx, pptx, json, xml, pdf, imagem) descrevem estrutura (`heading`, `paragraph`, `list`, `table`, `code`); só o builder sabe escapar. Docx e html passam por mammoth e turndown, sem o builder.

```ts
// src/core/MarkdownBuilder.ts
export class MarkdownBuilder {
  readonly #blocks: string[] = [];

  heading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
    this.#blocks.push(`${'#'.repeat(level)} ${oneLine(text)}`);
    return this;
  }
```

```ts
// src/core/MarkdownBuilder.ts
const cell = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, '<br>');
```

**Alternativa descartada.** Concatenação de string em cada converter. Zero abstração, mas o escape de `|` e `\` se repete em dez lugares e um esquecido vira tabela quebrada.

**Por que Builder.** Constrói um documento por etapas com interface fluente e um único ponto de escape.

## Facade (dupla)

**Problema.** Quem usa a lib não deve montar detector, registry, backends e converter.

**Onde.** `Anymark.convert()` em `src/Anymark.ts`.

```ts
// src/Anymark.ts
async convert(input: Input, options: ConvertOptions = {}): Promise<ConversionResult> {
```

```ts
// src/Anymark.ts
const converter = mime === undefined ? undefined : await this.registry.resolve(mime);
```

```ts
// src/Anymark.ts
const mime = this.#detector.detect({ data, ...hints, ...(name === undefined ? {} : { name }) });
const backends = new BackendChain(options.backends ?? this.#backends, options);
const result = await converter.convert(source, { sourceId, options, backends });
```

Uma chamada (`createAnymark().convert(bytes)`) esconde detecção, resolução do converter, cadeia de backends e identidade do resultado (`sourceId` é o hash do conteúdo, nunca vem do plugin).
