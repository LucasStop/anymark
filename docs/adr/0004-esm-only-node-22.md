# 0004. ESM-only, Node 22 ou mais, TypeScript `~6.0`, `tsc`

Status: aceita (implementada; proposta em 14/10/2026). Dono: Lucas Stopinski.

## Contexto

A lib roda em Next.js e em Node puro. Conferido em 14/10: Node 20 está fora de suporte; vitest 5.0.4 pede Node `^22.12`, `^24` ou `>=26`; unpdf 1.8.1 pede `>=22`; TypeScript `latest` é 7.0.2, mas typedoc 0.28.20 aceita até 6.0.x e typescript-eslint 8.71.2 exige `<6.1`.

## Decisão

`engines: node >=22`, CI em 22 e 24. TypeScript fixado em `~6.0`. Build com `tsc`, só ESM. O pacote é validado por `yarn pack` e `tar -tzf` no CI; `publint` e `attw --pack` seguem como meta.

## Consequências

- `require(esm)` existe no Node 22, então consumidor CJS ainda carrega a lib.
- Sem bundler, sem ferramenta a mais. CJS dedicado é o corte nº 6 e entra com `tsdown` só se algo exigir.
- TS e TypeDoc mudam rápido: versão fixada no `package.json`. Sem lockfile no git e sem Dependabot (removido no PR #144).
- Node 22 é o mínimo (`.nvmrc`).

## Alternativa descartada

`tsup` com ESM e CJS. Mais compatível, mas mais uma ferramenta sem exigência real hoje.
