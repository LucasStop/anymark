# 0006. Converter carregado sob demanda e extensão por plugin

Status: proposta (14/10/2026). Dono: Lucas Bruno.

## Contexto

Converters puxam dependências pesadas (mammoth, unpdf, tesseract.js). Quem converte só csv não deve pagar por elas. Quem precisa de um formato novo (ex.: `.srt`) não deve editar a lib (OCP).

## Decisão

O registry guarda `ConverterEntry` com `load()` assíncrono, resolvido na primeira conversão do formato. Um `Plugin` é um objeto que registra entradas na instância: `createAnymark().use(plugin)`. O plugin `.srt` do exemplo prova que nenhum arquivo de `src/` muda.

## Consequências

- Import dinâmico por converter, e o resultado é guardado após o primeiro carregamento.
- O kit `anymark/testing` valida converter de fábrica e plugin pelo mesmo contrato.
- No Next.js, `serverExternalPackages` para `anymark` e `tesseract.js` (conferir na versão instalada).
- Dois plugins com o mesmo mime: vale o último instalado (`use()` em ordem). Assim um plugin também substitui um converter embutido, e a regra é uma só, testada em `test/plugin.test.ts`.
- `load()` lazy cobre o que uma Factory faria. Factory não é defendida como padrão.

## Alternativa descartada

Import estático de todos os converters na fachada. Mais simples, mas carrega tudo sempre e obriga editar a fachada a cada formato.
