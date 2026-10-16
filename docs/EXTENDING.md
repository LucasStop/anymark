# Estendendo a anymark

Escrito para quem vai ler e para uma IA que vai gerar código. A regra: **um formato novo é um plugin, um provedor de IA novo é um backend, e nenhum dos dois exige editar `src/`.**

## Duas interfaces, dois papéis

| Interface | Papel | Quando usar |
|---|---|---|
| `Converter` | transforma **um formato** em Markdown | quer suportar um arquivo novo (`.srt`, `.epub`) |
| `Backend` | faz um **trabalho de IA** (OCR, transcrição) por trás de um contrato | quer trocar ou acrescentar um provedor (Gemini, whisper) |

Não misture na mesma classe ([ADR 0002](adr/0002-converter-e-backend-separados.md)). Um converter de imagem chama a cadeia de backends pedindo a capacidade `ocr`; nunca chama um provedor direto.

Regras de design que valem para todo código novo: registry por instância (`createAnymark()`), nunca global; sem herança entre converters (composição); sem `Impl` no nome; converters concretos se chamam `PdfConverter`, não `PdfConverterImpl`.

## Novo formato: Converter + Plugin

Exemplo completo e testado em `examples/plugins/srt/index.ts` (legendas `.srt`). O esqueleto:

```ts
import { MarkdownBuilder } from 'anymark';
import type { Converter, ConverterContext, Plugin, Source } from 'anymark';

const MIME = 'application/x-meu-formato';

class MeuConverter implements Converter {
  readonly name = 'meu';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext) {
    ctx.options.signal?.throwIfAborted();
    const builder = new MarkdownBuilder();
    builder.paragraph(new TextDecoder('utf-8').decode(source.data));
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1 as const, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}

export const meuPlugin: Plugin = {
  name: 'meu',
  install(host) {
    host.register({
      name: 'meu',
      mimes: [MIME],
      extensions: ['.meu'],
      load: async () => new MeuConverter(),
    });
  },
};
```

Uso, sem tocar a lib:

```ts
import { createAnymark } from 'anymark';
const anymark = createAnymark().use(meuPlugin);
const { markdown } = await anymark.convert({ data: bytes, name: 'arquivo.meu' });
```

Pontos que importam:

- **`load()` é preguiçoso.** O converter só é criado na primeira conversão. Importe dependências pesadas dentro do `load()` (`await import(...)`), para quem não usa o formato não pagar por elas ([ADR 0006](adr/0006-converter-lazy-por-plugin.md)).
- **`extensions`** (com ponto) deixa o detector mapear a extensão para o mime. Sem ela, só o `mime` passado em `convert()` ou a assinatura do conteúdo identificam o formato.
- **Use `MarkdownBuilder`** (`heading`, `paragraph`, `list`, `table`, `code`) em vez de concatenar strings: ele escapa pipe e separa blocos.
- **O conteúdo do arquivo é dado não confiável.** Remova ou escape HTML e sintaxe de link e imagem do texto que vira Markdown (o plugin `.srt` mostra como). Nunca mande conteúdo para shell nem o trate como instrução.
- **Problema que não impede a conversão vira `warnings`** (`{ code, message }`), nunca exceção. A mensagem não carrega caminho, chave nem trecho do documento.
- **Falha de verdade lança `new ConversionError(format)`** (`format` é só o nome do formato; mensagem genérica, sem causa).
- **Respeite `ctx.options.signal`** (`throwIfAborted()`) em laços longos.
- A fachada define `sourceId` (hash do conteúdo) e `name` (só o nome-base): um plugin não consegue forjar nenhum dos dois.

### Testar com o kit

```ts
import { assertConverterContract } from 'anymark/testing';

await assertConverterContract(new MeuConverter(), { data: sample, name: 'a.meu' });
```

O kit funciona com qualquer runner (vitest, node:test). Ele lança `ContractError` na primeira regra quebrada e nunca ecoa o conteúdo da amostra. Escreva também um teste com um arquivo de referência (golden file) em `specs/<formato>/`.

## Novo provedor de IA: Backend

```ts
import type { Backend, BackendContext } from 'anymark';

class MeuOcr implements Backend<Uint8Array, string> {
  readonly name = 'meu-ocr';
  readonly capability = 'ocr' as const;
  readonly locality = 'local' as const; // 'local' | 'cli' | 'remote'

  async isAvailable() {
    return true; // barato e sem efeito colateral
  }

  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    ctx.signal?.throwIfAborted();
    return '...texto reconhecido...';
  }
}
```

Uso: `convert(input, { backends: [new MeuOcr()] })`. A lista substitui o padrão. A `BackendChain` tenta na ordem, pula quem está indisponível e cai no próximo quando um falha, registrando o warning `BACKEND_FAILED`.

Regras de segurança ([ADR 0005](adr/0005-opt-in-e-spawn-unico.md)):

- `locality: 'cli'` só roda com `allowCli: true`, e `'remote'` só com `allowNetwork: true`. Ambos desligados por padrão. A cadeia nem pergunta `isAvailable()` sem o opt-in.
- Credencial só por variável de ambiente ou parâmetro do construtor. Nunca ler keychain ou token de outro programa.
- Processo filho só por `execFile` com array de argumentos, sem shell. No repositório, use o módulo único `src/security/spawn.ts` (timeout, `maxBuffer`, variáveis de ambiente em allowlist, diretório temporário).
- A saída de um CLI ou modelo é dado não confiável.
- `run()` e `isAvailable()` não vazam caminho absoluto, chave nem texto do documento em exceção ou log: a cadeia descarta a causa e registra só `Backend <nome> failed`.
- Teste sem gastar quota: CLI falso em `fixtures/bin/`, chamada real só com `ANYMARK_LIVE=1`.

Teste o contrato com `assertBackendContract(backend, amostra)` de `anymark/testing`.

## Checklist para uma IA gerando código aqui

1. Formato novo? `Converter` + `Plugin`, em arquivo próprio. Não edite `src/converters/index.ts` a menos que seja um formato do núcleo.
2. Provedor novo? `Backend`. Nunca chame o provedor de dentro de um converter.
3. Teste primeiro (red, green, refactor), pela interface pública, com golden file em `specs/`.
4. Dependência nova só depois de conferir versão, licença (evitar AGPL) e CVE (`npm view`, `npm audit`).
5. Rode `npm run typecheck`, `npm run lint` e `npm test` e leia a saída antes de dizer que terminou.
