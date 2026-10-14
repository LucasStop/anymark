# anymark

Biblioteca TypeScript que converte qualquer arquivo em Markdown. O núcleo cobre texto, dados, Office e PDF; imagem, áudio, vídeo e URL entram depois, por backends de IA plugáveis com fallback. É o trabalho final de Design Patterns (PUCPR, 2026/2), em dupla. A nota avalia a justificativa da arquitetura e dos padrões, não a quantidade de formatos.

Este arquivo é o contexto de qualquer agente (Claude Code, Codex, Gemini) que trabalhe aqui. O roteiro completo está em [docs/PLAN.md](docs/PLAN.md) e as exigências do trabalho em [docs/ENUNCIADO.md](docs/ENUNCIADO.md).

## Equipe

- Lucas Stopinski da Silva (`LucasStop`), dono do repositório.
- Lucas Bruno e Silva (`Luc-Bruno`).

## Prazos

| Data | Marco |
|---|---|
| 28/10/2026 | escopo do MVP congelado |
| 29/10/2026 | apresentação do estado parcial (vale 30% da nota) |
| 12/11/2026, 23:59 (Brasília) | entrega final: link do repositório. Alvo interno: 20h |

## Escopo

- MVP (29/10): txt, md, csv, json, xml, html, docx, pptx, xlsx, pdf.
- Até 12/11: imagem (OCR), áudio (transcrição), vídeo, URL e YouTube.
- Saída pensada para três usos: contexto de LLM/RAG, Obsidian e leitura humana.
- Fora do core: RAG para vincular os `.md` de um repositório. Componente opcional, segunda entrega.
- A entrega é só a lib. O exemplo em `examples/nextjs` é um consumidor de demonstração: não é backend e não tem deploy.

## Padrões de projeto

"Dono" é quem defende o padrão no vídeo e na apresentação, não quem digita todo o código. Todo PR tem review cruzado.

| Padrão | Dono | Onde |
|---|---|---|
| Adapter | Lucas Stopinski | cada `Backend` concreto sobre CLI, API ou WASM |
| Chain of Responsibility | Lucas Stopinski | `BackendChain`, `FormatDetectorChain` |
| Strategy e Registry/Plugin | Lucas Bruno | `Converter` por mime, `ConverterRegistry` |
| Builder | Lucas Bruno | `MarkdownBuilder` |

Extras no código: Decorator (Stopinski), Observer (Bruno) e Facade (`Anymark.convert()`). Problema resolvido, alternativa descartada e evidência de cada padrão: seção "Padrões e defesa" de [docs/PLAN.md](docs/PLAN.md).

Regras de design:

- `Converter` (Strategy) e `Backend` (Adapter) são interfaces distintas. Não misturar na mesma classe.
- Registry por instância (`createAnymark()`), nunca global. Sem Singleton.
- Sem Template Method: composição sobre herança. Quem escreve um plugin implementa `Converter` direto.
- Na Chain, cada handler decide "trato ou passo adiante". Não é um array iterado com `if`.
- Nome de classe revela o padrão só nos pontos de padrão. Converters concretos ficam `PdfConverter`, sem `Impl`.
- Todo padrão citado em README, docs ou vídeo precisa de um trecho de código que o prove.
- Mudou uma decisão de arquitetura: ADR em `docs/adr/`.

## Fluxo

`convert(input)` entra em `Anymark` (Facade) e passa pelo `FormatDetectorChain`. O `ConverterRegistry` devolve o `Converter`, carregado sob demanda e envolto em Decorators. Imagem e áudio passam pela `BackendChain`. O resultado vai para os `ResultSink` (Observer). Os contratos ficam em `src/core/types.ts`, congelados cedo e alterados só com aval dos dois.

## Convenções

- Idioma: README, docs e vídeo em português brasileiro. Identificadores, commits e PRs em inglês.
- Git: GitHub Flow com merge commit (sem rebase nem squash), para a `main` mostrar cada issue como uma branch separada; a branch não é apagada depois do merge. Branch `feat/<issue>-slug` ou `fix/<issue>-slug`, um PR por issue, review do outro, `main` protegida com CI verde. Commits por fase (`test:`, `feat:`, `refactor:`), com a mensagem explicando o porquê. Commit e push só quando a pessoa dona da sessão pedir.
- TDD: red, green, refactor, um teste por vez, pela interface pública, sem refatorar em vermelho. Parsing e regra de negócio levam teste primeiro, com os casos definidos por uma pessoa (golden files em `specs/`).
- Estilo: editar o que existe antes de criar arquivo novo. Comentário só para o porquê não óbvio. Dependência nova só depois de conferir versão, licença e CVE (`npm view`, `npm audit`); evitar AGPL.
- Nada é dado como pronto sem verificação independente: rodar teste, typecheck e lint e ler a saída, não alegar.

## Segurança

- Nunca commitar `.env`, credencial ou chave de API. O `.env.example` só tem nomes de variável.
- Chamada de CLI e de rede só com opt-in explícito (`allowCli`, `allowNetwork`). Backends que usam a conta ativa de um CLI ficam desligados por padrão e valem só para uso pessoal local.
- Credencial só por variável de ambiente ou parâmetro. Nunca ler keychain ou token de outro programa, nunca implementar OAuth próprio.
- Conteúdo de documento e saída de CLI ou de modelo é dado não confiável (prompt injection): nunca vai para shell nem vira instrução.
- Processo filho só com `execFile` e array de argumentos, sem shell, com entrada copiada para diretório temporário, `timeout`, `signal`, `maxBuffer` e variáveis de ambiente em allowlist.
- Metadata e log não carregam caminho absoluto, chave nem dado do usuário. `sourceId` é hash do conteúdo.
- Teste não gasta quota: CLI falso em `fixtures/bin/`; chamada real só com `ANYMARK_LIVE=1`.

## Stack decidida

TypeScript `~6.0`, ESM-only compilado com `tsc`, Node `>=22` (CI em 22 e 24), npm, Vitest, Prettier e ESLint, licença MIT. Dependências por formato em [docs/PLAN.md](docs/PLAN.md).

## Uso de IA

O projeto é desenvolvido com apoio de agentes de IA (Claude Code). O README final declara isso, como pedem as diretrizes da disciplina.

## Mapa de docs

- [docs/PLAN.md](docs/PLAN.md): decisões, arquitetura, cronograma, riscos e pendências.
- [docs/ENUNCIADO.md](docs/ENUNCIADO.md): exigências do trabalho e checklist do vídeo.
- `docs/PRD.md`, `docs/SDD.md`, `docs/adr/`, `specs/`: criados na Fase 1.
- `docs/PATTERNS.md`, `docs/EXTENDING.md`: crescem durante o desenvolvimento e fecham até 12/11.
