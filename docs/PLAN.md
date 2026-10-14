# Plano do anymark

Estado combinado em 14/10/2026. Decisão de arquitetura que mudar vira ADR em `docs/adr/`, e este arquivo acompanha. Exigências do trabalho: [ENUNCIADO.md](ENUNCIADO.md). Regras para quem contribui: [../AGENTS.md](../AGENTS.md).

## Objetivo

Biblioteca TypeScript (`anymark`) que converte arquivos em Markdown, com registry plugável de converters e backends de IA (OCR e transcrição) com fallback. A nota depende da justificativa da arquitetura, não do número de formatos. Dupla: Lucas Stopinski e Lucas Bruno.

Prazos: 28/10 congela o escopo do MVP. 29/10 é a apresentação do parcial (30% da nota). 12/11, 23:59 (Brasília), é a entrega final, com alvo interno de 20h.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Stack | TypeScript e npm. Pacote e repositório `anymark`. |
| Equipe | Dono do repositório: `LucasStop`. Colaborador: `Luc-Bruno`. |
| Método | PRD, SDD, TDD, issues, GitHub Project, CI/CD. `docs/SDD.md` e `specs/` por feature, ligadas às issues. Red, green, refactor, commits por fase. |
| Git | GitHub Flow com rebase-merge. Branch `feat/<issue>-slug`, um PR por issue com review cruzado, `main` protegida com CI verde. |
| MVP (29/10) | txt, md, csv, json, xml, html, docx, pptx, xlsx, pdf. Imagem, áudio, vídeo e URL ou YouTube até 12/11. |
| IA | Interface `Backend` com cadeia e fallback. Dois modos plugáveis: CLI já logado (`claude -p`, `codex exec`, `agy -p`) e chave de API (Gemini, OpenAI). Locais: whisper.cpp e tesseract.js. Nunca ler token ou keychain, nunca fazer OAuth próprio. |
| Distribuição | Repositório público. Pacote no npm público, com publicação por tag no CI (stretch). TypeDoc no GitHub Pages. |
| Demo | `examples/nextjs` no mesmo repositório, roda local: upload, preview e uma extensão registrada sem tocar a lib. Sem deploy. |
| Saída | Markdown para contexto de LLM/RAG (GFM limpo, headings estáveis, chunking), para Obsidian (front matter opcional, nomes seguros, imagens em `assets/`) e para leitura humana. |
| Template | Repositório `LucasStop/project-template`, extraído do anymark no fim (stretch). |
| Idioma | PT-BR em README, docs e vídeo. Identificadores, commits e PRs em inglês. |
| Padrões | Stopinski: Adapter e Chain of Responsibility. Bruno: Strategy/Registry e Builder. Extras no código: Decorator, Observer, Facade. |
| RAG | Opcional, fora do core, segunda entrega: vincular os `.md` dos repositórios que usam a lib. |
| Fine-tuning | Não usar. Modelo ajustado de terceiro entra como `Backend`. |

## Stack verificada em 14/10/2026

| Item | Decisão | Base |
|---|---|---|
| Node | `engines >=22`, CI em 22 e 24. | vitest 5.0.4 pede ^22.12, ^24 ou >=26; unpdf 1.8.1 pede >=22; Node 20 está fora de suporte. |
| TypeScript | Fixar `~6.0`. | `latest` é 7.0.2, mas typedoc 0.28.20 aceita TS 5.0 a 6.0.x e typescript-eslint 8.71.2 exige `<6.1`. |
| xlsx | `read-excel-file` 9.3.12. | O `xlsx` do npm parou em 0.18.5, com CVE-2023-30533 e CVE-2024-22363 (citados por pesquisa; conferir com `npm audit`). |
| Registry | Instância (`createAnymark()`), sem global. | Singleton ou registry global duplica módulo entre layers no Next.js e quebra o isolamento de teste. |
| Build | ESM-only com `tsc`; CJS só se algo exigir. | Node >=22 tem `require(esm)`. Validar com `publint` e `attw --pack`. Vira ADR. |
| Lint e format | Prettier e ESLint (Biome é alternativa). | Casa com os templates de CI e lefthook. |
| Publicação | Trusted publishing (OIDC) em vez de token em Secrets. Primeiro publish manual com 2FA. | Exige npm >=11.5.1 e runner hospedado (fontes secundárias, reconfirmar). O enunciado não exige npm. |
| Template Method | Fora. | Herança concorre com Strategy. Aula 01, slide 40: "Prefira composição à herança". |

## Padrões e defesa

| Padrão | Dono | Onde | Problema real | Evidência em aula | Alternativa descartada |
|---|---|---|---|---|---|
| Adapter | Stopinski | cada `Backend` concreto sobre CLI, API ou WASM | interfaces incompatíveis sob um contrato | Aula 3: `TableData` e `PlanetsTableData`; o professor nomeia Adapter | `if/else` por provedor dentro do converter (viola OCP) |
| Chain of Responsibility | Stopinski | `BackendChain` e `FormatDetectorChain` | tentar em ordem, pular indisponível, decidir "trato ou passo adiante" | não visto em aula | laço sobre array com `if` |
| Strategy | Bruno | `Converter` por mime | trocar o algoritmo sem `switch` gigante | Aula 4: `ColumnData<T>` (sem nome no código; a defesa nomeia) | `switch(mime)` numa função |
| Registry/Plugin | Bruno | `ConverterRegistry.register`, `load()` lazy, `createAnymark().use(plugin)` | formato novo sem editar a lib; dependência pesada só sob demanda | PoEAA (bibliografia); não visto em aula | registry estático global |
| Builder | Bruno | `MarkdownBuilder` (escape de pipes, listas, tabelas, headings) | escape duplicado e frágil | Aula 4: `ColumnsBuilder` e `TableBuilder` | concatenação de string espalhada |

Extras no código: Decorator (`FrontMatterDecorator`, `ChunkingDecorator`, retry, timeout; visto como atividade em `PagedTableData`), Observer (`ResultSink`; atividade em `ObservableTableData`) e Facade (`Anymark.convert()`, sem defesa).

Regras: `Converter` (Strategy) e `Backend` (Adapter) ficam em interfaces distintas. Sem Template Method, sem Singleton, sem Factory defendida (o `load()` lazy do registry cobre). Nomes de classe revelam o padrão só nos pontos de padrão (`ConverterRegistry`, `BackendChain`, `FormatDetectorChain`, `MarkdownBuilder`, `ResultSink`); converters concretos ficam `PdfConverter`, sem `Impl`. Todo padrão citado no README precisa de trecho que o prove; um teste de cerca de 10 linhas confere que cada caminho e símbolo de `docs/PATTERNS.md` existe.

**Risco:** Chain e Registry não foram vistos em aula e estão entre os padrões a defender. Reservas: Decorator e Observer, vistos como atividade. Perguntar ao professor se aceita Chain, Registry e Facade.

## Arquitetura mínima para 29/10

- Contratos em `src/core/types.ts`: `Input`, `ConvertOptions` (`signal`, `allowCli`, `allowNetwork`, `backends`, `lang`), `Source`, `Metadata` (com `schemaVersion: 1` e `sourceId` igual ao sha256 do conteúdo), `ConversionResult`, `Converter`, `ConverterEntry` (`load()` lazy), `Backend<In, Out>` (`capability`, `locality`, `isAvailable`, `run`) e `Plugin`.
- Fluxo: `convert(input)` entra no `Anymark` (Facade), passa pelo `FormatDetectorChain`, o `ConverterRegistry` devolve o `Converter` envolto em Decorators, imagem e áudio passam pela `BackendChain`, e o resultado vai para os `ResultSink`.
- Extensão sem tocar a lib: `examples/plugins/srt/index.ts` exporta um `Plugin` que registra `.srt`, e `examples/nextjs/src/anymark.ts` faz `createAnymark().use(srtPlugin)`. Nenhum arquivo de `src/` muda.
- Kit `anymark/testing`: `assertConverterContract` e `assertBackendContract`, funções que lançam erro, sem importar Vitest. Checam nome, mimes, `schemaVersion`, rejeição com `signal` abortado, saída determinística e que backend sem opt-in não faz rede nem `spawn`.
- Arquivos críticos: `src/core/types.ts`, `src/core/ConverterRegistry.ts`, `src/core/FormatDetectorChain.ts`, `src/backends/BackendChain.ts`, `src/backends/spawn.ts`, `src/Anymark.ts`, `src/index.ts`, `package.json`.

## Dependências por formato

Reconferir com `npm view` ao instalar. Versões conferidas em 14/10/2026: read-excel-file 9.3.12, unpdf 1.8.1, mammoth 1.13.0, turndown 7.2.4, csv-parse 7.0.3, fast-xml-parser 5.11.2, tesseract.js 7.0.0, fflate 0.8.3, yaml 2.9.1, vitest 5.0.4, eslint 10.12.0, prettier 3.9.10.

- txt e md: `chardet` e `iconv-lite`. csv: `csv-parse`. json: `JSON.parse`. xml: `fast-xml-parser`, saída em bloco de código.
- html: `turndown` com `turndown-plugin-gfm`; `@mozilla/readability` só para URL. docx: `mammoth` para HTML e depois `turndown`.
- pptx: parser próprio com `fflate` e `fast-xml-parser` (slides, tabelas, notas); evitar `officeparser`. xlsx: `read-excel-file`.
- pdf: `unpdf`, só texto plano; estrutura é stretch; `pdftotext -layout` como Adapter opcional. Evitar `mupdf` (AGPL).
- imagem: `tesseract.js` com `langPath` e `cachePath` locais; download de traineddata só com opt-in. Front matter: `yaml`. Detecção de tipo: própria, cerca de 80 linhas. APIs de IA: `fetch` direto.
- Imagens dentro de docx, pptx e pdf: ignoradas por padrão; extração e descrição por IA só com opt-in.

## Backends de IA

- `claude` 2.1.296: existem `--safe-mode` (desliga CLAUDE.md, hooks, MCP e plugins do ambiente de quem roda), `--restricted`, `--tools`, `--permission-prompts none`, `--no-session-persistence` e `--output-format`. **`--max-turns` não aparece no `--help`: não usar.** Proposta a validar no spike: `claude -p --safe-mode --tools Read --permission-prompts none --no-session-persistence --output-format json`, com cwd em tmp isolado, a imagem como arquivo e leitura do campo `result`. `--bare` não serve (pula o keychain). Se `--safe-mode` e `--restricted` mantêm o login de assinatura: a testar.
- `codex-cli` 0.162.1: existem `-i`, `-s`, `-C`, `--skip-git-repo-check`, `--ephemeral`, `--ignore-user-config` e `-o`. Comportamento real não testado.
- `agy` 1.3.5: existem `-p`, `--output-format json`, `--json-schema`, `--add-dir`, `--mode` e `--sandbox`. **Sem flag de imagem ou áudio no `--help`.** Não se sabe se aceita áudio por caminho. Spike antes de entrar na cadeia; se falhar, sai da cadeia.
- Ordem padrão: imagem = tesseract.js, Gemini, `claude -p`, `codex exec -i`. Áudio = whisper-cli, Gemini, OpenAI, `agy -p`. Claude e Codex não recebem áudio.
- Whisper: converter antes com `ffmpeg -y -i in -ar 16000 -ac 1 -c:a pcm_s16le out.wav`; modelo por `ANYMARK_WHISPER_MODEL`, sem caminho fixo. OpenAI aceita 25 MB por arquivo (comprimir e segmentar); Gemini aceita cerca de 20 MB inline.
- `spawn.ts` único: `execFile` com array (sem shell), entrada copiada para `mkdtemp` com nome fixo, `timeout`, `signal`, `maxBuffer`, env em allowlist e `rm` no `finally`.
- `BackendChain`: ordem configurável; `isAvailable` falso pula; `cli` exige `allowCli`; `remote` exige `allowNetwork`; erro de backend vira warning sem chave nem caminho; todos falhando lança `NoBackendError`. O modo conta ativa vale só para uso pessoal local e fica desligado por padrão. Saída de CLI de IA nunca vai para shell.
- Testes não gastam quota: CLI falso em `fixtures/bin/` e teste real atrás de `ANYMARK_LIVE=1`. Nunca definir `OPENAI_API_KEY` nem `CODEX_API_KEY` no nível do job.
- O spike faz uma chamada real por CLI e consome quota: combinar antes.

## TDD, CI/CD, template e RAG

- **TDD:** Vitest 5, cobertura v8 (core cerca de 90%, geral cerca de 80%). Parsing leva teste primeiro, com os casos definidos como golden files em `specs/`. Fixtures pequenas geradas por script (menos de 20 KB, sem material de terceiros). Todo converter passa pelo kit de contrato. Validar o pacote com `npm pack --dry-run`, `publint` e `attw --pack`, instalar o tarball no example e rodar `next build`. O example precisa de `serverExternalPackages: ['anymark', 'tesseract.js']` e `runtime = 'nodejs'` (conferir na versão instalada); o limite de body do serverless vira aviso na doc.
- **CI/CD:** `permissions: contents: read` por padrão e actions de terceiros fixadas por SHA. Workflows: `ci` (lint, typecheck, teste com cobertura, build e pack-check; Node 22 e 24), `codeql`, `dependency-review`, `gitleaks`, `docs` (TypeDoc para Pages) e `release` (tag `v*` igual à versão do `package.json`, `environment: npm`, `id-token: write`). Dependabot na raiz, em `/examples/nextjs` e em github-actions, com `cooldown` e grupos. Release com `gh release create --generate-notes`.
- **Template:** fora do caminho crítico. Montar o esqueleto dentro do anymark e extrair para `LucasStop/project-template` no fim, com limite de um dia. Um template feito antes da primeira instância erra as abstrações.
- **RAG (segunda entrega):** componente opcional, fora do core. Consome a saída pronta para RAG da lib (front matter, headings estáveis, `ChunkingDecorator`, `addSink`). Embeddings por Ollama local com `nomic-embed-text`, índice JSON simples e script sob demanda, sem `sqlite-vec` nem `onnxruntime`. RAG acerta busca parafraseada e erra filtro numérico e temporal: serve para sugerir vínculos, nunca como fonte única. Chunk por `headingPath` só funciona com headings; PDF sai em texto plano, então chunk por tamanho com overlap, sem prometer RAG de PDF.

## Cronograma

| Fase | Datas | Entrega |
|---|---|---|
| 0 | 14/10 | Semente do repositório (concluída). |
| 1 | 14 a 16/10 | PRD, SDD, ADRs, issues, remoto, scaffold e `types.ts` congelado. |
| 2 | 16 a 22/10 | Núcleo: `Anymark` (Facade), `ConverterRegistry`, `FormatDetectorChain`, `MarkdownBuilder`. CI verde. txt, md, csv, json, xml. |
| 3 | 22 a 28/10 | html, docx, xlsx, pdf, pptx. Example Next.js com plugin `.srt`. Kit `anymark/testing`. Contrato `Backend` com um adapter real e `BackendChain` com fallback demonstrável. Docs e README. Congelar em 28/10. |
| Marco | 29/10 | Apresentação parcial: caso padrão, extensão `.srt` sem tocar a lib, fallback de backend, padrões no código. |
| 4 | 29/10 a 06/11 | Imagem e áudio (02/11 é feriado). Decorators (front matter, chunking). Observer (`addSink`). RAG opcional se sobrar. |
| 5 | 06 a 09/11 | Vídeo (ffmpeg para áudio), URL e YouTube. Gravar o vídeo depois de congelar. |
| 6 | 09 a 12/11 | Polimento, `docs/PATTERNS.md`, "Uso de IA", tag 0.1.0, vídeo de defesa. Entrega até cerca de 20h do dia 12. |

## Esboço de issues

Refinar no `/to-issues`. Dono é quem defende o padrão, com review cruzado.

- `types.ts` e ADR do registry: Stopinski, com aval do Bruno.
- `Anymark` e `ConverterRegistry`: Stopinski faz o esqueleto, Bruno completa (`load()` lazy, `use(plugin)`).
- `FormatDetectorChain` (assinatura, ZIP/OOXML, sniff, extensão): Stopinski.
- `MarkdownBuilder` e converters txt, md, csv, json, xml: Bruno.
- Converters html, docx, pdf, xlsx, pptx: Bruno. Se a capacidade ficar curta, pptx e xlsx saem do MVP.
- Kit de contrato `anymark/testing`: Bruno.
- `Backend`, `BackendChain`, `spawn.ts`, adapters whisper e tesseract: Stopinski.
- CI, Pages, release, CodeQL, gitleaks, Dependabot: Stopinski.
- Example Next.js e plugin `.srt`: Bruno, com review do Stopinski.
- Decorators: Stopinski. `addSink` e Observer: Bruno.
- Imagem, áudio, vídeo, URL: Stopinski nos backends, Bruno nos converters.
- `PATTERNS.md`, `EXTENDING.md`, README, "Uso de IA", vídeo: cada um escreve os seus padrões.

## Riscos e ordem de corte

**Riscos:**

- Caminho crítico no registry e nos converters. Mitigação: `types.ts`, Facade, Registry mínimo e `FormatDetectorChain` saem primeiro.
- Escopo grande para uma dupla. Manter PRD de uma página, SDD curto, `specs/` só para registry, backends e plugin, e ADRs só para as decisões reais.
- Os CLIs de IA mudam flags entre versões. São o pior custo e benefício.
- O example Next.js não é a entrega (o enunciado proíbe REST e executável como entrega). O README diz que é só um consumidor de demonstração.
- Commits red/green com rebase-merge deixam commits vermelhos na `main`. O CI exige verde só no head do PR. Aceitável: o histórico prova o TDD.
- Releases rápidas (TS 7, TypeDoc 1.0): lockfile e Dependabot com cooldown.

**Ordem de corte** (do primeiro):

1. Template e skill de criação de projetos.
2. API fluente do Builder. O `MarkdownBuilder` interno é o padrão defendido e fica; cortar o Builder inteiro exige acordo e troca por Observer, senão o Bruno fica com um padrão só.
3. Publicação no npm.
4. URL e YouTube.
5. Formato vídeo.
6. CJS.
7. pptx.
8. Estrutura de PDF.
9. Backends CLI de conta ativa (manter APIs e whisper local).

README e vídeo de defesa não se cortam.

## Pendências

1. Convite ao `Luc-Bruno` enviado em 14/10 (permissão `write`); falta ele aceitar.
2. Disponibilidade semanal de cada um.
3. Duração máxima do vídeo, que define 4 ou 6 padrões defendidos (default: 4, citando as reservas).
4. O professor aceita Chain, Registry e Facade? Qual o mínimo de padrões para dupla?
5. Node 22 na máquina de cada um (`nvm install 22`).
6. Conta npm com 2FA e primeiro publish manual, ou pular a publicação (`npm pack` basta para o parcial).
7. Spike dos CLIs de IA, uma chamada por CLI, combinando a quota antes.
8. Significado de "vincular" no RAG (sugerir wikilinks, `related:` no front matter, backlinks) e se é plugin de exemplo ou pacote próprio.
9. Prettier e ESLint ou Biome (default: Prettier e ESLint). Licença (default: MIT).
10. Se cada aluno entrega o link no Canvas.
