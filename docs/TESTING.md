# Cenários de teste manual

Mapa dos cenários que a dupla roda à mão, além dos testes automatizados (`npm test`, golden files em `specs/`). Os arquivos reais usados ficam fora do repositório (público): a tabela guarda só formato, tamanho aproximado e os 8 primeiros caracteres do sha256 do conteúdo (`sourceId`), sem caminho nem texto.

## Como rodar

```sh
npm run build
ANYMARK_LANG_PATH="$PWD/node_modules/@tesseract.js-data/eng/4.0.0_best_int" \
  node scripts/manual-run.mjs arquivo1.pdf arquivo2.xlsx
```

`scripts/manual-run.mjs` converte cada arquivo, grava o Markdown em `manual-out/<id>.md` (ignorado pelo git) e imprime uma linha por arquivo: id, extensão, tamanho, tempo e resultado. `--hidden` liga `includeHiddenSheets` (issue #48). Ler o `.md` gerado faz parte do teste: conferir, não presumir.

## Rodada 1: 16/10/2026, Lucas Stopinski, arquivos reais do Desktop

Node 22, `main` em 17bbca6. 39 arquivos de uso próprio (faculdade e estudo), 3 a 5 por formato. Resultado: 37 convertidos, 2 `CONVERSION_FAILED` esperados (docx e pdf de 0 bytes), nenhuma exceção não tratada.

| Id | Formato | Cenário | Tamanho | Resultado | Observação |
|---|---|---|---|---|---|
| T01 | txt | 14 bytes | 14 B | ok | |
| T02 | txt | vazio | 0 B | ok, 0 caracteres | |
| T03 | txt | médio | 7 KB | ok | |
| T04 | txt | grande | 4,3 MB | ok, 6 ms | |
| M01 | md | pequeno | 2,4 KB | ok | |
| M02 | md | nome com espaço, acento e parênteses | 5,6 KB | ok | |
| M03 | md | grande | 134 KB | ok | |
| C01 | csv | pequeno, tabular | 1,2 KB | ok | |
| C02 | csv | médio | 49 KB | ok | |
| C03 | csv | grande | 14 MB | ok, 777 ms, saída de 21 MB | tabela Markdown cresce mais que o CSV |
| J01 | json | muito aninhado | 57 KB | ok | |
| J02 | json | grande | 2,9 MB | ok | |
| X01 | xml | com namespaces | 2,3 KB | ok | |
| X02 | xml | minúsculo | 194 B | ok | |
| X03 | xml | grande | 100 KB | ok | |
| H01 | html | formulário | 2,4 KB | ok, 108 caracteres | só os rótulos dos campos |
| H02 | html | página simples | 16 KB | ok | |
| H03 | html | página salva com CSS e scripts embutidos | 207 KB | ok, 78 ms | scripts e estilos removidos |
| D01 | docx | vazio (0 B) | 0 B | `CONVERSION_FAILED` | esperado: erro genérico, sem caminho |
| D02 | docx | nome com espaço e parênteses | 12 KB | ok | |
| D03 | docx | nome com acento, exercícios | 19 KB | ok | |
| D04 | docx | muitas imagens | 9,5 MB | ok, 207 ms | imagens removidas, só texto |
| P01 | pptx | acento no nome | 61 KB | ok | |
| P02 | pptx | com imagens | 1,7 MB | ok | |
| P03 | pptx | com mídia, quase só imagens | 4,4 MB | ok, 144 caracteres | slides sem texto saem só com o título `## Slide N` |
| P04 | ppt | formato legado, vazio | 0 B | ok, 0 caracteres | **a verificar**: um `.ppt` legado não é suportado e passa como texto vazio |
| S01 | xlsx | extensão `.XLSX` maiúscula, mime ambíguo | 5,7 KB | ok, 10 caracteres | só `## Sheet1`, planilha sem dados |
| S02 | xlsx | tabela de casos de teste | 9,7 KB | ok | |
| S03 | xlsx | dados | 13 KB | ok | |
| S04 | xlsx | várias abas, espaço no nome | 27 KB | ok | |
| S05 | xlsx | acento no nome, maior | 61 KB | ok | |
| F01 | pdf | vazio (0 B) | 0 B | `CONVERSION_FAILED` | esperado |
| F02 | pdf | tabela-verdade | 233 KB | ok | |
| F03 | pdf | slides com código | 751 KB | ok | |
| F04 | pdf | livro escaneado, sem camada de texto | 15 MB | ok, mas só `## Page N` vazios | **a verificar**: nenhum warning avisa que o PDF não tem texto |
| R01 | srt | nome com espaço duplo e `+` | 18 KB | ok | |
| I01 | jpg | captura de tela com texto (OCR) | 29 KB | ok, 51 caracteres, 233 ms | |
| I02 | jpg | foto de documento (OCR) | 2,1 MB | ok, 1274 caracteres, 3,6 s | |
| I03 | png | captura de app (OCR) | 310 KB | ok, 249 caracteres, 487 ms | `libpng warning: iCCP` do decodificador, inofensivo |

### Achados da rodada 1

1. **PDF escaneado sem aviso (F04).** Sai uma lista de `## Page N` vazia e `warnings` vazio. Sugestão: warning `PDF_NO_TEXT` quando nenhuma página tem texto, apontando OCR como saída.
2. **`.ppt` legado vazio (P04)** passou como texto. Conferir com um `.ppt` legado não vazio se vira `UnsupportedFormatError` ou lixo binário.
3. Imagem com muito texto leva segundos (I02): o OCR não tem timeout próprio (limite conhecido).

## Cenários ainda não rodados à mão

Marcar data, responsável e resultado ao rodar.

| Id | Cenário | Esperado | Resultado |
|---|---|---|---|
| Z01 | pdf protegido por senha | `ConversionError`, sem vazar a senha ou o caminho | |
| Z02 | arquivo corrompido (docx, xlsx, pptx, pdf truncados) | `CONVERSION_FAILED` genérico | |
| Z03 | extensão trocada (um `.pdf` renomeado para `.docx`) | detecta pela assinatura, não pela extensão | |
| Z04 | `.ppt` e `.doc` legados não vazios | erro claro de formato não suportado | |
| Z05 | gif, webp e jpeg com texto (#47) | texto reconhecido | 16/10/2026, Lucas Stopinski: ok, `HELLO HOLE` nos três (golden files em `specs/image`, gerados por `scripts/make-image-fixture.mjs`; jpeg via `sips`); sem arquivo real do Desktop com gif ou webp |
| Z06 | xlsx com aba oculta e `veryHidden` (#48) | pulada por padrão com warning `HIDDEN_SHEETS_SKIPPED`; incluída com `includeHiddenSheets` | 16/10/2026, Lucas Stopinski: ok, workbook sintético com `hidden` e `veryHidden` (testes em `test/xlsx.test.ts`); sem planilha real com aba oculta |
| Z07 | OCR sem traineddata local e sem `allowDownload` | `OcrError` genérico, sem download | |
| Z08 | OCR por padrão em `createAnymark()` (#46) | converte sem passar `backends` | 16/10/2026, Lucas Stopinski: ok, `HELLO HOLE` offline (teste automatizado em `test/tesseract.test.ts`) |
| Z09 | entrada como `Uint8Array`, como `Source` com `name`, e com `mime` | mesmo Markdown | |
| Z10 | `signal` abortado antes e durante a conversão | rejeita, não devolve resultado parcial | |
| Z11 | plugin `.srt` registrado com `createAnymark().use(plugin)` | usa o plugin, sem tocar a lib | |
| Z12 | `BackendChain` com o primeiro backend falhando | cai no próximo, warning `BACKEND_FAILED` sem chave nem caminho | |
| Z13 | CLI e rede sem `allowCli` e `allowNetwork` | nunca chamados | |
| Z14 | texto com Latin-1, UTF-8 com BOM, UTF-16 | Latin-1 e BOM ok; UTF-16 sem BOM não detectado (limite) | |
| Z15 | html com `javascript:` e `data:` em links e imagens | links removidos | |
| Z16 | arquivo muito grande (acima de 100 MB) | xlsx e docx recusam por teto; demais sem teto (limite) | |

## Limites conhecidos

- json: números acima de 2^53 perdem precisão.
- html: sem tamanho ou tempo máximo; tabelas sem cabeçalho ou aninhadas ficam como HTML cru.
- xlsx: células de erro saem vazias; abas `hidden` e `veryHidden` ficam fora por padrão (`includeHiddenSheets: true` as inclui), mas linhas e colunas ocultas dentro de uma aba visível seguem no Markdown.
- docx: células mescladas e tabelas aninhadas ficam como HTML cru; avisos do mammoth não viram warnings; notas de rodapé mantidas.
- pptx: não lê `mc:AlternateContent`, slides ocultos nem aninhamento de bullets.
- pdf: sem prazo próprio além do `signal`; PDF escaneado não passa por OCR.
- tesseract: sem timeout próprio.
- Texto UTF-16 sem BOM não é detectado.
