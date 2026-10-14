# 0003. Chain: cada handler decide "trato ou passo adiante"

Status: proposta (14/10/2026). Dono: Lucas Stopinski.

## Contexto

Dois pontos precisam "tentar em ordem": detecção de formato (assinatura, OOXML, sniff, extensão) e escolha de backend (disponível, com opt-in, sem falha). Chain of Responsibility não foi vista em aula, então a defesa depende de ela resolver um problema real.

## Decisão

`FormatDetectorChain` e `BackendChain` são cadeias de handlers. Cada handler recebe a entrada e responde com resultado ou passa ao próximo. Adicionar um handler não altera os outros. A forma exata (objetos com `next` ou funções compostas) fica aberta no SDD.

## Consequências

- Novo detector ou backend entra sem editar laço central.
- `BackendChain` concentra opt-in, pulo de indisponível e erro vira warning. Esse comportamento tem um único teste.
- Risco: o professor pode não aceitar Chain. Reservas: Decorator e Observer.

## Alternativa descartada

Laço sobre array com `if` por item. Funciona, mas a regra "trato ou passo adiante" fica no laço e não no handler, e a defesa do padrão some.
