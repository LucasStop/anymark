# Cenários de teste manual

Mapa dos cenários que a dupla roda à mão, além dos testes automatizados (`yarn test`, golden files em `specs/`). Os arquivos reais usados ficam fora do repositório (público): a tabela guarda só formato e tamanho aproximado, sem caminho, sem texto e sem hash.

## Como rodar

```sh
yarn build
ANYMARK_LANG_PATH="$PWD/node_modules/@tesseract.js-data/eng/4.0.0_best_int" \
  node scripts/manual-run.mjs arquivo1.pdf arquivo2.xlsx
```

`scripts/manual-run.mjs` converte cada arquivo, grava o Markdown em `manual-out/<id>.md` (ignorado pelo git) e imprime uma linha por arquivo: id, extensão, tamanho, tempo e resultado. `--hidden` liga `includeHidden` (issues #48 e #68). Ler o `.md` gerado faz parte do teste: conferir, não presumir.

## Revisão visual da interface

A demo (`examples/nextjs`) tem verificação à mão, sem teste automático: abrir em `localhost:3000`, conferir claro e escuro, teclado (Tab percorre dropzone, opções, Converter, abas) e `prefers-reduced-motion`. Os critérios estão em [DESIGN.md](DESIGN.md) e as capturas de referência em `docs/assets/design/`.

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
| P04 | ppt | formato legado, vazio | 0 B | ok, 0 caracteres | vazio passa como texto vazio; legado não vazio vira `UnsupportedFormatError` (Z04, #67) |
| S01 | xlsx | extensão `.XLSX` maiúscula, mime ambíguo | 5,7 KB | ok, 10 caracteres | só `## Sheet1`, planilha sem dados |
| S02 | xlsx | tabela de casos de teste | 9,7 KB | ok | |
| S03 | xlsx | dados | 13 KB | ok | |
| S04 | xlsx | várias abas, espaço no nome | 27 KB | ok | |
| S05 | xlsx | acento no nome, maior | 61 KB | ok | |
| F01 | pdf | vazio (0 B) | 0 B | `CONVERSION_FAILED` | esperado |
| F02 | pdf | tabela-verdade | 233 KB | ok | |
| F03 | pdf | slides com código | 751 KB | ok | |
| F04 | pdf | livro escaneado, sem camada de texto | 15 MB | ok, mas só `## Page N` vazios | resolvido em 16/10/2026 (#49): warning `PDF_NO_TEXT`; #66: páginas com imagem embutida passam por OCR |
| R01 | srt | nome com espaço duplo e `+` | 18 KB | ok | |
| I01 | jpg | captura de tela com texto (OCR) | 29 KB | ok, 51 caracteres, 233 ms | |
| I02 | jpg | foto de documento (OCR) | 2,1 MB | ok, 1274 caracteres, 3,6 s | |
| I03 | png | captura de app (OCR) | 310 KB | ok, 249 caracteres, 487 ms | `libpng warning: iCCP` do decodificador, inofensivo |

### Achados da rodada 1

1. **PDF escaneado sem aviso (F04). Resolvido (#49).** Saía uma lista de `## Page N` vazia e `warnings` vazio. Agora o warning `PDF_NO_TEXT` aparece quando nenhuma página tem texto e aponta o OCR como saída. Desde a #66 as páginas com imagem embutida passam por OCR; o warning fica para quando não dá (sem imagem ou sem backend).
2. **`.ppt` legado (P04). Resolvido (#67).** Vazio passa como texto vazio; com cabeçalho OLE2 vira `UnsupportedFormatError`, coberto por `test/legacy-office.test.ts`. `.doc`, `.ppt` e `.xls` ficam não suportados.
3. Imagem com muito texto leva segundos (I02): o OCR não tem timeout próprio (limite conhecido).

## Rodada 2: 20/10/2026, Lucas Stopinski, Desktop inteiro

1.210 arquivos do Desktop (sem as pastas de faculdade e trabalho), conversão em lote com `scripts/manual-run.mjs`. Achado principal: célula de docx com mais de um parágrafo quebrava a linha da tabela em 17 de 29 docx (#85, corrigido: o `<br>` dentro de `td` e `th` sai literal). Lição em [PROBLEMAS.md](PROBLEMAS.md).

## Rodada 3: 26/10/2026, Lucas Stopinski, ensaio do tarball (#98)

`yarn pack` na `main`, tarball instalado com `yarn add file:` num projeto vazio fora do repositório, Node 22. Rodados pela API pública do pacote instalado: txt, csv, docx, pdf com texto, png (OCR) e `pdf: { layout: 'spread' }` (`specs/pdf/scanned-spread.pdf`, `lang: 'pt'`). Todos convertem, sem warnings, com o Markdown esperado; o spread leva cerca de 2,5 s. Tipos: um `.ts` com `createAnymark`, `ConversionResult`, `TesseractBackend`, as opções de `pdf` e `anymark/testing` passa no `tsc --strict` com `moduleResolution: nodenext`. `anymark/nope` falha com `ERR_PACKAGE_PATH_NOT_EXPORTED`, ou seja, `exports` só abre `.` e `./testing`.

Conteúdo do tarball (109 entradas com o `.DS_Store` local, 108 num build limpo): `dist/`, `package.json`, `README.md`, `LICENSE` e `.env.example` (só nomes de variável). Achados: o `.env.example` entra sem estar em `files` (o yarn clássico o inclui por conta própria); um `dist/.DS_Store` entra quando o `dist/` local tem o arquivo; o `package.json` dizia `0.0.0` até o PR de preparação do 0.1.0 (#150).

Achado que importa (#148): o `.yarnrc` do repositório tem `ignore-scripts true`, então o yarn não roda o `prepack` (`yarn build`) no `yarn pack` nem no `yarn publish`. Com `dist/` apagado, o tarball sai com 5 entradas e sem `dist/`; o ensaio acima usou um `dist/` já compilado. Por isso o README e a publicação rodam `yarn build` antes do `yarn pack` e do `yarn publish`, e o `release.yml` compila e confere o tarball antes de anexá-lo ao Release.

## Rodada 4: 26/10/2026, revisão visual independente do livro escaneado (#100)

Um revisor independente (agente de leitura, sem acesso para editar) comparou a saída de `pdf: { layout: 'spread', cleanup: { trim: true, dehyphenate: true } }` com `lang: 'pt'` contra as imagens do PDF de teste (18 folhas duplas, livro físico do Lucas, arquivos fora do repositório). Amostra: folhas 1, 2, 3, 6, 9, 13, 16 e 18, da capa ao fim, 1.407 palavras impressas conferidas.

| Medida | Resultado |
|---|---|
| Palavras impressas corretas | cerca de 95% (94,7% no total; 91 a 96% por folha), intervalo plausível de 92 a 96% |
| Contando tokens de lixo da margem como erro | cerca de 85 a 90% |
| Ordem de leitura das duas páginas | certa em todas as folhas vistas |

Ressalva: estimativa visual, por leitura de imagens a 100 dpi e contagem manual em 8 das 18 folhas (cerca de 100 palavras por página), sem gabarito digital do livro. O intervalo reflete a amostra pequena e a incerteza de leitura nas páginas muito sublinhadas ou anotadas.

O que sobra errado:

- Palavras coladas, por causa do sublinhado do leitor (`eleacortacom`, `tinhaavercomo`); só o OCR resolve.
- Hifenização que sobra (114 linhas terminando em hífen no arquivo): o `dehyphenate` não junta quando há ruído ou linha em branco entre as duas linhas. É o maior ganho possível.
- Hífen legítimo perdido (`fazêlo`, `repensála`).
- Letras trocadas (`À` por `A`, `rn` por `m`, `€` por `e`).
- Manuscrito e marcas na margem viram tokens soltos em todas as folhas de texto; as anotações maiores viram lixo ilegível (esperado).
- Cabeçalho corrente e número de página ficam no texto; notas de rodapé ficam coladas no fim da página.
- Linhas quase vazias (`|`, `i`) vindas da lombada e da sombra.
- Nomes próprios conferidos saíram certos.

## Cenários ainda não rodados à mão

Marcar data, responsável e resultado ao rodar.

| Id | Cenário | Esperado | Resultado |
|---|---|---|---|
| Z01 | pdf protegido por senha | `ConversionError`, sem vazar a senha ou o caminho | |
| Z02 | arquivo corrompido (docx, xlsx, pptx, pdf truncados) | `CONVERSION_FAILED` genérico | |
| Z03 | extensão trocada (um `.pdf` renomeado para `.docx`) | detecta pela assinatura, não pela extensão | |
| Z04 | `.ppt`, `.doc` e `.xls` legados não vazios | erro claro de formato não suportado | 20/10/2026: `UnsupportedFormatError` nos três (`test/legacy-office.test.ts`) |
| Z05 | gif, webp e jpeg com texto (#47) | texto reconhecido | 16/10/2026, Lucas Stopinski: ok, `HELLO HOLE` nos três (golden files em `specs/image`, gerados por `scripts/make-image-fixture.mjs`; jpeg via `sips`); sem arquivo real do Desktop com gif ou webp |
| Z06 | xlsx com aba oculta e `veryHidden` (#48) | pulada por padrão com warning `HIDDEN_SHEETS_SKIPPED`; incluída com `includeHidden` | 16/10/2026, Lucas Stopinski: ok, workbook sintético com `hidden` e `veryHidden` (testes em `test/xlsx.test.ts`); sem planilha real com aba oculta |
| Z07 | OCR sem traineddata local e sem `allowDownload` | `OcrError` genérico, sem download | |
| Z08 | OCR por padrão em `createAnymark()` (#46) | converte sem passar `backends` | 16/10/2026, Lucas Stopinski: ok, `HELLO HOLE` offline (teste automatizado em `test/tesseract.test.ts`) |
| Z09 | entrada como `Uint8Array`, como `Source` com `name`, e com `mime` | mesmo Markdown | |
| Z10 | `signal` abortado antes e durante a conversão | rejeita, não devolve resultado parcial | |
| Z11 | plugin `.srt` registrado com `createAnymark().use(plugin)` | usa o plugin, sem tocar a lib | |
| Z12 | `BackendChain` com o primeiro backend falhando | cai no próximo, warning `BACKEND_FAILED` sem chave nem caminho | |
| Z13 | CLI e rede sem `allowCli` e `allowNetwork` | nunca chamados | |
| Z14 | texto com Latin-1, UTF-8 com BOM, UTF-16 | Latin-1, BOM e UTF-16 (LE e BE, com ou sem BOM) lidos; UTF-16 sem BOM só com texto latino (detecção pelos bytes zero) | |
| Z15 | html com `javascript:` e `data:` em links e imagens | links removidos | |
| Z16 | arquivo muito grande (acima de 100 MB) | xlsx e docx recusam por teto; html recusa acima de 25 MB (o docx também, se o HTML gerado passar disso); pptx recusa acima de 100 MB descompactados e corta em 2000 slides; xlsx recusa acima de 100.000 linhas e limita em 16.384 colunas; imagem recusa acima de 25 MB no tesseract; demais sem teto (limite) | |

## Limites conhecidos

- html: quebra de linha dentro de célula de tabela sai como `<br>` literal para manter a linha do GFM inteira (#85); entrada acima de 25 MB lança `ConversionError`; sem tempo máximo; tabelas sem cabeçalho ou aninhadas ficam como HTML cru.
- json: só inteiros em notação decimal pura ficam exatos; decimais longos, notação científica e `-0` seguem o `Number` do JavaScript.
- xlsx: abas, linhas e colunas ocultas ficam fora por padrão (`includeHidden: true` inclui), com warning e contagem; células de erro saem com o texto do erro (#68). Só os oito erros do Excel são aceitos, outro valor em `t="e"` é ignorado. Fórmula sem valor em cache continua vazia. Planilha com mais de 10 milhões de células (linhas vezes a coluna mais larga) é recusada, porque a biblioteca preenche o retângulo inteiro.
- docx: célula mesclada vira células vazias ao lado (warning `DOCX_MERGED_CELLS` com a contagem) e tabela aninhada vira texto da célula pai, células separadas por vírgula e linhas por ponto e vírgula (`DOCX_NESTED_TABLE`); a estrutura interna da tabela aninhada se perde (#69). Tabela com mais de 1 milhão de células depois de expandida (linhas vezes a largura) é recusada, e `gridSpan` e `rowspan` valem no máximo 1000. Avisos do mammoth não viram warnings; notas de rodapé mantidas.
- pptx: lê o `mc:Choice` de um `mc:AlternateContent` (o `mc:Fallback` se o Choice não rende nada), uma vez só; slides com `show="0"` ficam fora por padrão, com `HIDDEN_SLIDES_SKIPPED` e a contagem, e voltam com `includeHidden: true` (#70). Não lê o aninhamento de bullets.
- pdf: sem prazo próprio além do `signal`. PDF escaneado passa por OCR só se a página traz imagem embutida (JPEG, PNG etc.); página vetorial sem imagem fica vazia (renderizar exigiria canvas, dependência nativa) e o limite é 100 páginas escaneadas (as sem camada de texto que vão ao OCR), 4 imagens por página e 64 MB por imagem decodificada, com o warning `PDF_OCR_SKIPPED` e a contagem. Sem backend `ocr` utilizável a página fica vazia e o warning é `PDF_NO_TEXT`. Falha do backend no meio mantém o texto já lido e acrescenta `PDF_OCR_FAILED`. O teto de 64 MB é checado depois que o pdf.js decodifica a imagem, então uma imagem gigante em PDF pequeno ainda gasta memória antes de ser pulada. Imagem de 1 bit (fax: CCITT, JBIG2) é lida pela lista de operadores do `pdfjs-dist` e vira cinza de 8 bits (#89), e o lado de cima da imagem sai dos pixels (eixo das linhas de texto; `/Rotate` só ordena as duas voltas e a segunda só roda se a primeira lê como lixo), porque scanner deixa `/Rotate 0` em página de lado (#92); a matriz de transformação do conteúdo da página não é lida, então imagem girada só por `cm` fica torta. O OCR padrão lê inglês e português (`lang: 'pt'`); sem a dica, o idioma é inglês. Manuscrito e marcas na margem viram ruído no texto. Folha dupla (duas páginas impressas por folha) lida sem declarar sai com as colunas intercaladas: declare `pdf: { layout: 'spread' }` (#94), que corta na lombada (vale de tinta entre 40% e 60% da largura, senão no meio) antes do OCR. Lombada fora dessa faixa sai errada. `cleanup.trim` (#96) corta a moldura escura e o sombreado da lombada; a detecção do eixo ignora linhas e colunas quase inteiras de tinta quando são minoria fina, mas o `wordScore` continua favorecendo lixo em minúsculas sobre texto em caixa alta, então fixture em maiúsculas usa rotação declarada. `cleanup.dehyphenate` cola `letra-` + quebra + minúscula, e também cola um hífen de verdade (`guarda-` / `chuva`). Medido em 20/10/2026 no livro de teste, antes de `trim` e `dehyphenate` (estimativa visual de um revisor, não contagem): cerca de 82% das palavras impressas corretas, 6 de 18 páginas utilizáveis como estão. Com `spread`, `trim` e `dehyphenate`, a rodada 4 (26/10/2026, estimativa visual, 8 de 18 folhas) deu cerca de 95%, intervalo de 92 a 96%. A leitura do 1 bit só entra quando a página não tem outra imagem legível: página mista (uma imagem colorida e outra de 1 bit) perde a de 1 bit, e máscara de imagem (stencil) é ignorada, sem aviso.
- tesseract: sem timeout próprio.
- Texto UTF-16 sem BOM só é detectado quando é majoritariamente latino (um byte zero em quase toda unidade); CJK sem BOM não. Um arquivo sem extensão em UTF-16 sem BOM continua não reconhecido como texto pelo detector.
