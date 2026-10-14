# 0001. Registry por instância, sem global

Status: proposta (14/10/2026). Dono: Lucas Bruno.

## Contexto

O `ConverterRegistry` precisa aceitar formatos novos sem editar a lib. Um registry estático ou singleton é o jeito mais curto de fazer isso.

## Decisão

Cada `createAnymark()` cria o seu próprio `ConverterRegistry`. Nada de estado em módulo, nada de `getInstance()`.

## Consequências

- Teste isola por instância, sem limpar estado global entre casos.
- No Next.js o mesmo módulo pode ser carregado duas vezes (layers de server e de route handler). Um registry global ficaria duplicado e desencontrado. Por instância, quem cria passa a instância adiante.
- O custo é o chamador guardar a instância. O exemplo faz isso em um módulo próprio.

## Alternativa descartada

Registry estático global com `Anymark.register(...)`. Mais curto, mas vira Singleton disfarçado, quebra o isolamento de teste e falha na duplicação de módulos do Next.js.
