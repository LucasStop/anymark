# 0003. Chain: cada handler decide "trato ou passo adiante"

Status: aceita (implementada; proposta em 14/10/2026). Dono: Lucas Stopinski.

## Contexto

Dois pontos precisam "tentar em ordem": detecção de formato (dica, assinatura, ZIP/OOXML, extensão, texto estruturado, texto puro) e escolha de backend (disponível, com opt-in, sem falha). Chain of Responsibility não foi vista em aula, então a defesa depende de ela resolver um problema real.

## Decisão

`FormatDetectorChain` e `BackendChain` são cadeias de handlers. Cada handler recebe a entrada e responde com resultado ou passa ao próximo. Adicionar um handler não altera os outros. Forma adotada: `FormatHandler.handle(input, next)` e `BackendHandler.handle(capability, input, next)`, com `next` por closure.

## Consequências

- Novo detector ou backend entra sem editar laço central.
- `BackendChain` concentra opt-in, pulo de indisponível e erro vira warning. Esse comportamento é coberto em `test/BackendChain.test.ts`.
- Risco (fechado em 14/10/2026): o professor aceitou Chain. Reservas, ainda sem código: Decorator e Observer.

## Alternativa descartada

Laço sobre array com `if` por item. Funciona, mas a regra "trato ou passo adiante" fica no laço e não no handler, e a defesa do padrão some.
