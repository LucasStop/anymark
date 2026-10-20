# 0008. Um flag `includeHidden` para todo conteúdo oculto

Status: aceita (20/10/2026). Dono: Lucas Bruno. Altera o contrato `ConvertOptions` em `src/core/types.ts` (aval dos dois em 16/10/2026). Renomeia `includeHiddenSheets`, da issue #48.

## Contexto

Planilhas e apresentações guardam conteúdo que o autor escondeu: abas, linhas e colunas ocultas no xlsx, slides ocultos no pptx. Ele não aparece para quem abre o arquivo, mas é texto que um LLM ou um índice de busca leria como se fosse parte do documento. A #48 tratou só as abas e criou `includeHiddenSheets`.

## Decisão

`ConvertOptions.includeHidden` (padrão `false`) vale para qualquer conteúdo oculto de qualquer formato. Com `false`, o conteúdo fica fora do Markdown e o resultado traz um warning com a contagem do que saiu (`HIDDEN_SHEETS_SKIPPED`, `HIDDEN_ROWS_SKIPPED`, `HIDDEN_COLUMNS_SKIPPED`; `HIDDEN_SLIDES_SKIPPED` no pptx, #70). Com `true`, entra tudo e não há warning. O nome antigo some sem alias: a lib não foi publicada.

## Consequências

- Um formato novo que tenha "oculto" reaproveita o flag em vez de criar mais um.
- Não há como incluir só as abas ocultas e não as colunas. Quem precisa disso escreve um `Converter` próprio ([EXTENDING](../EXTENDING.md)).
- Linhas e colunas ocultas saem por posição (a coluna é contada se tem dado): o xlsx guarda a visibilidade no XML da planilha, que o `read-excel-file` não expõe, então o `XlsxConverter` lê esse XML também.

## Alternativa descartada

Um flag por tipo (`includeHiddenSheets`, `includeHiddenRows`, ...). Mais fino, mas a interface cresce a cada formato e o usuário tem de conhecer cada nome para obter o comportamento "inclua tudo".
