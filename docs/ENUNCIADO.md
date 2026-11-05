# Enunciado do trabalho final (resumo)

Paráfrase das exigências da disciplina de Design Patterns (PUCPR, 2026/2). Não é o texto oficial: em caso de dúvida vale o enunciado publicado pelo professor.

## O que entregar

- Uma biblioteca de verdade, publicável como pacote (npm, gem, jar, dll). Backend standalone, API REST ou aplicativo executável não valem como entrega.
- Linguagem e tema livres, em grupo de até 4 pessoas. O uso de IA é permitido; a avaliação foca na justificativa da arquitetura.
- Funcionalidade padrão já pronta (o enunciado cita XML e CSV como exemplo).
- Extensível sem alterar o código da lib (princípio aberto/fechado).
- A escolha dos padrões é do grupo. Cada aluno apresenta 2 padrões diferentes, então um grupo de 4 defende 8 e uma dupla defende 4.
- No Canvas, a entrega é só o link do repositório.

## README

- Nome completo de todos os integrantes.
- Link do vídeo no YouTube (pode ser não listado).
- Documentação de uso da lib.
- Seção "Uso de IA".

## Vídeo

No máximo 10 minutos no total (conferido no Canvas em 05/11/2026). Cada aluno defende 2 padrões, então uma dupla cobre 4 padrões em cerca de 6 minutos, com 4 de visão geral e uso.

1. Visão geral da lib.
2. Uso prático: caso padrão e caso com extensão (plugin sem tocar a lib).
3. Defesa arquitetural. Para cada padrão: qual é, onde está no código (com trecho), qual problema de design resolve e por que é adequado. Levar também a alternativa descartada, com prós e contras.

## Prazos

| Data | Marco |
|---|---|
| 28/10/2026 | congelar o escopo do MVP |
| 29/10/2026 | apresentação do estado parcial, vale 30% da nota |
| 18/11/2026, 23:59 (Brasília) | entrega final |
| 17 a 19/11/2026 | apresentação em sala (RA2), conforme o ClickUp; faz parte desta mesma entrega |

## Checklist final

- [x] Repositório público, com a `main` verde no CI.
- [ ] README com nomes completos, link do vídeo, uso e "Uso de IA".
- [ ] Caso padrão e caso de extensão funcionando a partir do README.
- [x] Cada padrão defendido tem trecho de código que o prova (`docs/PATTERNS.md`; `test/docs-references.test.ts` confere que cada trecho existe no arquivo citado).
- [ ] Vídeo publicado, cobrindo os três blocos.
- [ ] Link entregue no Canvas (confirmar se cada aluno entrega o seu).
