# Perguntas e respostas para a defesa

Perguntas que o professor pode fazer, segundo a rubrica de [ENUNCIADO.md](ENUNCIADO.md), com a resposta combinada entre os dois. Cada resposta aponta o arquivo do código que a prova. Os padrões em si estão em [PATTERNS.md](PATTERNS.md); aqui ficam as perguntas de visão geral, de uso e de extensão. Marcar uma pergunta como ensaiada só depois de responder em voz alta sem consultar.

## Bloco 1: visão geral e entrega

**Por que é uma lib e não um serviço?**
O enunciado exclui backend e API como entrega. Além disso, o uso previsto é dentro de outro projeto (o TCC): como serviço, teria de ser chamado a cada uso, com custo de rede e de tempo. Como lib, é uma chamada de função. O `examples/nextjs` é só um consumidor de demonstração.

**Quem usa e para quê?**
Quem precisa de texto limpo a partir de arquivos: contexto de LLM/RAG, Obsidian e leitura humana. Hoje o uso concreto é o TCC, mas a lib não depende dele.

**Como instala e roda o caso mínimo?**
`yarn add anymark` (o README só mostra yarn; `npm install anymark` também funciona) e `createAnymark().convert({ data, name })`. O exemplo completo está na seção "Uso" do [README](../README.md).

**Por que Node 22 e ESM-only?**
Decisão de stack, registrada no [ADR 0004](adr/0004-esm-only-node-22.md).

**Para que serve o `sourceId` e por que a metadata não leva caminho?**
- `sourceId` é o sha256 do conteúdo (`src/Anymark.ts`, `createHash`). Identifica o arquivo pelo conteúdo, não pelo nome: o mesmo conteúdo dá sempre o mesmo id, conteúdo diferente dá id diferente.
- Quem usa a lib guarda o id e pode pular o reprocessamento quando o mesmo id reaparecer. A lib não guarda histórico nem deduplica sozinha: ela só calcula e devolve o id; a decisão é de quem consome.
- O `sourceId` não serve para detectar o formato. Quem detecta é o `FormatDetectorChain`, olhando os bytes antes da extensão (`src/detection/handlers.ts`: um PDF renomeado para `.docx` continua PDF).
- A metadata não leva caminho absoluto por segurança: `baseName` em `src/Anymark.ts` corta o diretório do nome, senão um caminho como `/Users/...` vazaria em toda saída.

## Bloco 2: caso padrão e extensão

**O que acontece com um `.srt` sem o plugin?**
Não dá erro: um `.srt` é texto, então o detector o trata como `text/plain` e o `TxtConverter` devolve o conteúdo cru, com os tempos como texto solto (conferido em 27/10/2026 com `createAnymark().convert`). Com `createAnymark().use(srtPlugin)` sai um parágrafo por legenda, com o tempo em negrito. O plugin muda o resultado sem editar a lib.

**Quando a lib lança `UnsupportedFormatError`?**
Quando o conteúdo não é reconhecido como nenhum formato nem como texto válido, por exemplo bytes binários desconhecidos (`new Uint8Array([1])`) ou um `.doc`, `.ppt` ou `.xls` legado (`src/Anymark.ts`). É decisão de design, não falta de tratamento: a lib lança o erro e quem usa decide o que fazer (mensagem, fallback, tela).

**Como o plugin não vira efeito colateral de `import`?**
`import` não registra nada. O formato só entra quando se chama `createAnymark().use(srtPlugin)`, e só naquela instância (`Anymark.use` e `ConverterRegistry`, [ADR 0001](adr/0001-registry-por-instancia.md)). Com registry global, bastaria importar o plugin para o formato entrar em todo o programa, e duas instâncias compartilhariam estado.

**Um plugin pode mentir no `sourceId` ou no nome?**
Não. `sourceId` é calculado pela Facade e sobrescrito no resultado; o nome também é refeito pela Facade (`src/Anymark.ts`, comentário "The facade owns identity"). O plugin entrega o conteúdo; a identidade não é dele.

**Como um formato novo entra sem editar a lib?**
Cada formato, de fábrica ou de plugin, é uma entrada com o mesmo formato:

```ts
{
  name: 'html',
  mimes: ['text/html'],
  extensions: ['.html', '.htm'],
  load: async () => new (await import('./HtmlConverter.js')).HtmlConverter(),
}
```

`src/converters/index.ts` é só a lista dos formatos que já vêm de fábrica; o plugin faz o mesmo de fora, com `host.register(entry)`, sem tocar `src/`. Passo a passo:
1. `register` guarda duas tabelas na instância (`src/core/ConverterRegistry.ts`): mime para entrada, e extensão para o primeiro mime da entrada.
2. No `convert`, o detector tenta nesta ordem: dica, assinatura, ZIP/OOXML, extensão, texto estruturado, texto puro.
3. O handler de extensão (`src/detection/handlers.ts`) pergunta ao registry qual mime tem aquela extensão. A tabela é da instância, então o plugin adiciona a dele.
4. Com o mime, `registry.resolve(mime)` chama `load()`, que importa o converter só nesse momento (por isso o pdf.js não pesa para quem só lê csv).

**Ponto fraco: como a lib sabe que é `.srt`?**
`.srt` é texto puro e não tem assinatura de bytes. Só o `name` (a extensão) ou o `mime` passado como dica o identificam; sem eles, a cadeia cai em `PlainText` e sai como txt, igual a um arquivo sem o plugin. Há duas entradas independentes:
- `name: 'x.srt'` passa pelo handler de extensão.
- `mime: '...'` é uma dica que o `HintHandler` usa primeiro, antes de tudo. Não é a extensão.

Resposta pronta: "formato sem assinatura depende do nome ou do mime passado como dica".

## Bloco 3: armadilhas

### Padrões: o que cada um é, em uma frase

- **Chain of Responsibility:** vários elos em fila; cada um decide "eu trato ou passo adiante". No detector (`src/detection/FormatDetectorChain.ts`) o elo responde "reconheço este formato?" e devolve o mime, ou chama `next()`; quem converte é o converter, depois. Na `BackendChain` a pergunta é "posso rodar este backend (opt-in, disponível)?"; se não ou se falhar, passa ao próximo.
- **Registry/Plugin:** o registry não converte. É a tabela mime para converter, por instância, que carrega o converter na primeira vez que é pedido. O plugin cadastra um formato novo nessa tabela. Quem descobre o formato é o detector, que usa a tabela de extensões que o plugin alimentou.
- **Adapter:** cada provedor de IA (Gemini, Claude, Codex) precisa do seu adapter, que traduz a API dele para o contrato `Backend`. O que se evita é editar o converter de imagem, que só conhece `Backend`. Hoje só existe o adapter do tesseract (os outros são #21 e #22).
- **Strategy:** cada formato tem o seu algoritmo atrás da interface `Converter`, intercambiáveis e modulares. Escolher o tipo do arquivo é trabalho do detector; a Strategy é o fato de os converters serem trocáveis.
- **Builder:** `MarkdownBuilder` monta o Markdown por etapas (`heading`, `paragraph`, `list`, `table`, `code`) e é o único ponto de escape. Docx e html não passam por ele: `mammoth` (docx para HTML) e `turndown` (HTML para Markdown) já entregam Markdown.
- **Facade:** `Anymark.convert()` esconde detecção, registry, backends e `sourceId` atrás de uma chamada. Não concatena nem divide nada: só esconde as etapas.

### Decorator e Observer: planejados, sem código (#23 e #24)

Dizer sempre "planejados". Não são pré-requisito do caso padrão.
- **Observer (`ResultSink`, #24):** avisa de fora, por exemplo o progresso da conversão (#121 depende dele).
- **Decorator (#23):** embrulha o `Converter`, não o arquivo. Tem a mesma interface, delega ao converter de dentro e acrescenta algo antes ou depois. Serve para recursos que valem para qualquer formato (front matter YAML para Obsidian, chunking para RAG, retry, timeout) sem editar os dez converters e sem ligá-los por padrão. O usuário empilha o que quiser: `new ChunkingDecorator(new FrontMatterDecorator(pdfConverter))`. Alternativa descartada: um `if` por recurso dentro de cada converter, ou uma subclasse por combinação.

### Quantos padrões

O Canvas pede que cada aluno apresente 2 padrões; para uma dupla são 4. Há 5 defendidos (Adapter e Chain com Stopinski; Strategy, Registry/Plugin e Builder com Bruno), mais a Facade no código. O mínimo está coberto.

### O que garante que a documentação não mente

`test/docs-references.test.ts` confere que cada caminho em crase de README, PATTERNS e EXTENDING existe e que cada linha dos trechos de PATTERNS aparece no arquivo de código citado. Limites: não confere a ordem das linhas, não confere se o trecho prova o padrão e não cobre PRD, SDD, PLAN, TESTING nem ADRs. Esses foram conferidos à mão na #101, com revisão independente. Na defesa, citar esses limites e não dizer "o teste garante tudo".

### Uso de IA

Declarar completo, como o README: a IA escreve código e documentação sob direção da dupla; cada mudança passa por testes escritos antes (TDD), CI e revisão de quem não escreveu. O Canvas avalia a justificativa da arquitetura, então cada um precisa explicar também o padrão do outro.

### Acurácia do OCR

Cerca de 95% das palavras impressas certas (94,7%, intervalo de 92 a 96%) e 85 a 90% contando o lixo de margem. É estimativa visual, não medida automática, feita em 8 das 18 folhas do livro escaneado (1.407 palavras). Fonte: "Rodada 4" em [TESTING.md](TESTING.md).

### Review cruzado e divisão do trabalho

Verdade conferida no GitHub em 27/10/2026: dos 71 PRs mergeados, 69 foram abertos por Lucas Stopinski e 2 pelo Dependabot; nenhum foi aberto nem revisado pelo Bruno. As reviews registradas (58) são do `copilot-pull-request-reviewer`; a revisão independente foi feita por agente de IA e o merge passou pelas checagens obrigatórias do CI. Nos commits, 58 de 268 na `main` são do Bruno (cerca de 22%), dentro de PRs abertos pelo Stopinski. Dizer isso como está: a divisão de commits existe, mas a revisão humana cruzada foi pouca. Não afirmar "todo PR teve review do outro".

Ações até 12/11: o Bruno comenta o aval do `src/core/types.ts` na #101; os PRs dele (a partir da #24) são abertos por ele e revisados pelo Stopinski, e vice-versa; antes de 29/10 ele revisa PRs já mergeados dos padrões que defende (Strategy, Registry/Plugin, Builder) e deixa comentário.

### Segurança

Defesa de desenho. A lib não usa shell: `execFile` com array de argumentos, entrada copiada para diretório temporário, `timeout`, `maxBuffer`. Chamada de CLI e de rede só com opt-in (`allowCli`, `allowNetwork`). Conteúdo de documento é dado não confiável. Ver `src/security/spawn.ts` e [ADR 0005](adr/0005-opt-in-e-spawn-unico.md). Hoje nenhum backend usa `runCli`, então não há um caso rodando.

### Fallback

A demo é um teste, não um backend real caindo: `test/BackendChain.test.ts` ("hands the converter a chain built from options.backends and surfaces its warnings") põe um backend que falha antes de um que funciona e mostra o resultado do segundo com o warning `BACKEND_FAILED`, com backends falsos.

### Dívidas conhecidas

- O link do vídeo no README ainda é um placeholder.
- O ADR 0008 tem data inconsistente (cabeçalho e texto).
- Z09 a Z13 em TESTING aparecem como "não rodados" apesar de haver teste automatizado.
