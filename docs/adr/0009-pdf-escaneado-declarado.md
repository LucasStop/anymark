# 0009. O chamador declara o tipo do PDF escaneado

Status: aceita (20/10/2026). Dono: Lucas Stopinski. Altera o contrato `ConvertOptions` em `src/core/types.ts` (campo `pdf`, aval do Bruno pendente no PR da #94).

## Contexto

Na conferência do livro escaneado (#89, #92), cada folha trazia duas páginas impressas, em rotações misturadas, com `/Rotate` que não dizia onde ficava o alto. Adivinhar tudo pelos pixels deu ~82% das palavras certas e 6 de 18 folhas utilizáveis; o que sobrou foi folha dupla lida linha a linha, com as colunas intercaladas. Uma heurística geral errou de formas novas a cada livro (a primeira versão da #92 errou 4 páginas por causa da faixa escura do scanner).

## Decisão

`ConvertOptions.pdf` (`PdfOptions`) deixa o chamador dizer o que entra: `layout` (`single`, padrão, ou `spread`), `rotation` (`0`, `90`, `180`, `270` ou `auto`, padrão) e `binding` (`left`, padrão, ou `right`). Com `spread`, cada folha é girada e cortada na lombada antes do OCR e as duas páginas saem em ordem de leitura. Rotação fixa pula a detecção e o segundo OCR. Sem declaração, o comportamento é o de antes (`single`, `auto`). Valor desconhecido lança `ConversionError('pdf')`, sem eco do valor.

## Consequências

- O ajuste fino é opt-in: chamada simples não muda e o que a pessoa sabe do livro vale mais que o palpite da lib.
- Caso novo (lombada ao centro, limpeza de borda, #95) entra como campo novo de `PdfOptions`, não como heurística escondida.
- O corte da lombada é o vale de tinta na faixa de 40% a 60% da largura; se não há vale claro, corta no meio. Folha com a lombada fora dessa faixa sai errada: declare `single`.
- Manuscrito na margem continua virando ruído; nenhuma opção resolve isso.

## Alternativa descartada

Perfis nomeados em um registry (`livro-escaneado-spread`). Mais um ponto de extensão para defender e para manter, e os três campos já descrevem o que muda de um scan para outro. Se a lista de campos crescer demais, o perfil vira açúcar sobre `PdfOptions`, sem quebrar o contrato.
