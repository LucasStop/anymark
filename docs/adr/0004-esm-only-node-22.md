# 0004. ESM-only, Node 22 ou mais, TypeScript `~6.0`, `tsc`

Status: proposta (14/10/2026). Dono: Lucas Stopinski.

## Contexto

A lib roda em Next.js e em Node puro. Conferido em 14/10: Node 20 está fora de suporte; vitest 5.0.4 pede Node `^22.12`, `^24` ou `>=26`; unpdf 1.8.1 pede `>=22`; TypeScript `latest` é 7.0.2, mas typedoc 0.28.20 aceita até 6.0.x e typescript-eslint 8.71.2 exige `<6.1`.

## Decisão

`engines: node >=22`, CI em 22 e 24. TypeScript fixado em `~6.0`. Build com `tsc`, só ESM. Validar o pacote com `publint` e `attw --pack`.

## Consequências

- `require(esm)` existe no Node 22, então consumidor CJS ainda carrega a lib.
- Sem bundler, sem ferramenta a mais. CJS dedicado é o corte nº 6 e entra com `tsdown` só se algo exigir.
- Lockfile e Dependabot com `cooldown`, porque TS e TypeDoc mudam rápido.
- Máquina do Lucas Stopinski está em Node 20.19.6: instalar Node 22 antes do scaffold.

## Alternativa descartada

`tsup` com ESM e CJS. Mais compatível, mas mais uma ferramenta sem exigência real hoje.
