# Problemas do caminho

O que deu errado durante o desenvolvimento, a causa, como resolvemos e o que ficou de lição. Serve de material para o vídeo e para a defesa, e para quem ler o repositório depois. Problema novo entra aqui quando aparece. Números (`#49`, `#80`) são issues e PRs do repositório.

## 1. Segurança de entrada

O documento é dado não confiável. Quase todo bug sério veio de um converter confiar demais no arquivo.

| Problema | Causa | Como resolvemos |
|---|---|---|
| Texto invisível chegava ao Markdown e a um LLM (`display:none`, `hidden`, `w:vanish`) | HTML e docx guardam texto que o leitor nunca vê, e mammoth ignora `w:vanish` | HtmlConverter descarta o que o leitor não vê; o docx corta as runs ocultas antes do mammoth |
| Link `javascript:` e `data:` na saída | A URL do `href` ia direto para o Markdown | Só o texto do link fica quando o alvo é perigoso |
| Zip bomb em xlsx e docx | Arquivo de KB inflava para GB; `read-excel-file` não limita | Teto de 100 MB descompactado pelo diretório do zip, antes de abrir |
| xlsx esparso gastava memória | A biblioteca preenche o retângulo linhas x colunas; uma célula em `XFD20000` vira 328 milhões de posições | Teto de linhas e de 10 milhões de células, checado no XML antes da leitura (#68) |
| Aninhamento absurdo de HTML estourava a pilha | Recursão do parser | `ConversionError` genérico em vez de crash; teto de 25 MB no HTML (#63) |
| Nome de aba virava Markdown vivo | `# x *y*` no nome da planilha | Escape do rótulo |
| `__proto__` e chaves herdadas no JSON | Tabela lia chaves não próprias | Só chaves próprias, linhas sem chave são puladas |
| Mensagem de erro vazando nome de parte do arquivo | Mensagens de mammoth, pdf.js e fflate descrevem o arquivo | Todo erro vira `ConversionError('<formato>')`, sem caminho nem conteúdo |

Lição: o teste que prova que o dado hostil não vaza vale mais que o teste do caso feliz. Cada converter tem pelo menos um teste hostil.

## 2. O que a revisão cética achou e o teste feliz não

Cada PR passou por um subagente independente que tenta quebrar o código, inclusive por mutação. Os achados reais:

- **PDF escaneado (#66, PR #80).** O teto de 64 MB por imagem era checado depois de decodificar, então um PDF pequeno com imagem gigante gastava 1,7 GB. Um `catch` largo descartava o texto já lido sem aviso. Corrigido: falha parcial mantém o texto e emite `PDF_OCR_FAILED`; o limite de memória ficou documentado, porque o `unpdf` não deixa limitar antes da decodificação.
- **xlsx (#68, PR #82).** A ocultação falhava aberta: aspas simples, espaço em volta do `=`, `<row>` sem `r`, planilha em subpasta e erro vindo de fórmula escapavam das expressões regulares. Corrigido com leitura tolerante dos atributos, erro quando a aba não é encontrada (falha fechada) e o teto de células.
- **docx (#69, PR #83).** Um `gridSpan` de 1000 sobre milhares de linhas multiplicava o HTML por 90. Corrigido com teto de 1 milhão de células expandidas. Também: o texto em volta de tabela aninhada ficava colado, e mescladas dentro de aninhada eram contadas como expandidas.
- **pptx (#70, PR #84).** `show="False"` ou com espaços deixava o slide oculto visível. Corrigido com `trim` e minúsculas.

Lição: padrão de falha repetido. Onde a decisão é "o que esconder", o erro tem de cair para o lado seguro. Regex sobre XML é frágil; qualquer variação legal de escrita é um vazamento em potencial.

## 3. Bibliotecas de terceiros

| Biblioteca | Surpresa | Saída |
|---|---|---|
| `read-excel-file` | Descarta células de erro, visibilidade de linhas e colunas, e preenche o retângulo inteiro | Leitura própria do XML da planilha para o que ela esconde (ADR 0008) |
| `mammoth` | Ignora `w:vanish`; emite `colspan`, `rowspan` e tabela dentro de célula | Pré-processamento do zip e passe próprio de tabelas |
| `unpdf` / pdf.js | Sem canvas, só devolve imagens embutidas já decodificadas; descarta imagem de 1 bit sem avisar | OCR só das imagens embutidas; o limite foi documentado (#66) |
| `pdf.js` | Segura o documento e as fontes até `destroy()` | `loadingTask.destroy()` em todo caminho |
| `tesseract.js` | Baixa dados de idioma da rede por padrão | Dados `eng` locais como dependência; `allowDownload` só por opt-in (ADR 0007) |
| TypeScript 6 | Não tipa `JSON.rawJSON` nem o terceiro argumento do reviver | Declaração ambient em `src/converters/json-source.d.ts` (#64) |
| `chardet` | Texto UTF-16 sem BOM é UTF-8 válido (os NUL passam) e o chute errava | Detecção por padrão de bytes zero antes do chute (#65) |

## 4. Teste sintético não é arquivo real

A rodada 1 (16/10, 39 arquivos) achou o PDF escaneado mudo e o `.ppt` vazio. A rodada 2 (20/10, 1.210 arquivos do Desktop) achou o que nenhum fixture sintético pegou: célula de docx com mais de um parágrafo quebra a linha da tabela em 17 de 29 arquivos (#85). Os fixtures tinham só células de um parágrafo. Corrigido na #85: dentro de `td` e `th` o `<br>` sai literal, em uma linha só, para html e docx.

Lição: a regra "teste primeiro com casos definidos por uma pessoa" não basta sozinha; rodar a lib em arquivos de verdade a cada conjunto de mudanças é parte do trabalho, e o resultado entra no [TESTING.md](TESTING.md).

## 5. Ferramentas e processo

- **Hook de pre-commit falhava em Node 20.** O `engines` do yarn exige Node 22. Todo comando de git e de yarn roda depois de `nvm use 22`.
- **Migração de npm para yarn (#75).** O yarn clássico não instala peer dependencies (o `vitest` pediu `vite`) e não tem `yarn pack --dry-run`; o CI empacota para um diretório temporário e lista o tarball com `tar -tzf`. Nenhum lockfile vai para o git.
- **Merge commit, nunca squash.** A `main` precisa mostrar cada issue como uma branch. Por isso o merge é `--merge` e a branch local é apagada à mão depois.
- **Ruleset com um admin só.** O autor do PR não pode se aprovar; o merge usa o bypass de admin em modo `pull_request`, com os 8 checks verdes.
- **Rede do GitHub oscilando.** `gh pr create` já falhou por timeout; antes de repetir, confira se o PR não foi criado (`gh pr list --head`).
- **Comando que espera entrada.** Um `cat` sem arquivo no meio de um encadeamento travou uma verificação por minutos; conferir o encadeamento antes de rodar.

## 6. Em aberto

- OCR de slide que é só diagrama devolve texto lixo; o OCR não tem timeout próprio.
- Imagens de 1 bit em PDF são descartadas sem aviso.
- Link do vídeo no README ainda é placeholder; vídeo só na entrega final (12/11).
