# PRD: anymark

Rascunho de 14/10/2026. Contexto e decisões: [PLAN.md](PLAN.md). Exigências do trabalho: [ENUNCIADO.md](ENUNCIADO.md).

## Problema

Quem alimenta um LLM, um índice de RAG ou um vault do Obsidian recebe arquivos em dezenas de formatos (docx, pdf, planilha, imagem, áudio). Hoje cada projeto reinventa a conversão para Markdown, com uma dependência e um jeito de escapar tabela por formato. Quando falta um formato, a única saída é editar a biblioteca ou escrever outra do zero. Para a disciplina, o problema é outro: o trabalho é avaliado pela justificativa da arquitetura, e a lib precisa ser estendida sem alterar seu código (OCP).

## Solução

Biblioteca TypeScript `anymark`: `convert(input)` devolve Markdown e metadados para qualquer formato suportado. Formatos de texto, dados, Office e PDF funcionam de fábrica. Imagem, áudio, vídeo e URL entram depois, por backends de IA plugáveis com fallback (CLI já logado, chave de API ou ferramenta local). Quem quiser um formato novo escreve um plugin e registra na própria instância, sem tocar a lib.

## Histórias de usuário

1. Como dev de Next.js, quero chamar `convert()` com um arquivo e receber Markdown, para alimentar um LLM sem escolher parser por formato.
2. Como dev, quero que o formato seja detectado pelo conteúdo e não só pela extensão, para que arquivo renomeado ou sem extensão converta certo.
3. Como dev, quero tabelas, listas e headings em GFM limpo, para o resultado servir direto em prompt e em leitura humana.
4. Como dev de RAG, quero headings estáveis, front matter opcional e chunking, para indexar sem pós-processar.
5. Como usuário de Obsidian, quero nomes de arquivo seguros e imagens em pasta própria, para jogar a saída no vault.
6. Como dev, quero registrar um plugin de formato (ex.: `.srt`) na minha instância, para suportar o que a lib não cobre sem fork.
7. Como dev, quero que cada conversor pesado só carregue quando o formato aparecer, para o bundle e o cold start não pagarem por formatos que não uso.
8. Como dev, quero uma cadeia ordenada de backends para imagem e áudio, com fallback automático, para a conversão não morrer porque um provedor caiu.
9. Como dev, quero que CLI e rede fiquem desligados até eu ligar `allowCli` e `allowNetwork`, para a lib nunca gastar quota nem vazar documento sem eu pedir.
10. Como dev, quero cancelar uma conversão com `signal`, para não deixar processo filho pendurado.
11. Como dev, quero acompanhar progresso e resultado por sinks, para mostrar status na UI ou registrar log.
12. Como autor de plugin, quero um kit de contrato (`anymark/testing`), para provar que meu converter ou backend respeita as regras sem reescrever os testes da lib.
13. Como avaliador da disciplina, quero achar no código o trecho que prova cada padrão defendido, para conferir a justificativa.
14. Como Lucas Stopinski e Lucas Bruno, queremos contratos congelados cedo, para trabalhar em paralelo sem quebrar um ao outro.

## Decisões de implementação

- Fachada única (`Anymark`, criada por `createAnymark()`): detecta o formato, resolve o converter, aplica decorators, repassa aos sinks.
- Registry por instância, nunca global. Converters entram como entradas com `load()` lazy. Plugin é um objeto que registra entradas.
- `Converter` (Strategy) e `Backend` (Adapter) são contratos distintos, em classes distintas. Sem Template Method, sem Singleton.
- Detecção em cadeia: cada handler decide "trato ou passo adiante" (assinatura, ZIP/OOXML, sniff de texto, extensão).
- `BackendChain`: ordem configurável, pula indisponível, exige opt-in por localidade, erro de backend vira warning sem chave nem caminho, todos falhando lança `NoBackendError`.
- Execução de processo filho concentrada em um único ponto, sem shell, com timeout, `signal`, limite de buffer, ambiente em allowlist e entrada copiada para diretório temporário.
- Metadados com `schemaVersion` e `sourceId` igual ao hash do conteúdo. Nada de caminho absoluto, chave ou dado do usuário em metadata ou log.
- Conteúdo de documento e saída de CLI ou modelo são dado não confiável: nunca vão para shell nem viram instrução.
- Contratos ficam congelados cedo e só mudam com aval dos dois.
- MVP de 29/10: txt, md, csv, json, xml, html, docx, pptx, xlsx, pdf. Até 12/11: imagem (OCR), áudio (transcrição), vídeo, URL e YouTube.
- Distribuição: ESM-only, Node >=22, TypeScript `~6.0`, licença MIT. Publicação no npm é corte nº 3.

## Decisões de teste

Um bom teste só observa comportamento externo, pela interface pública. Sem teste de detalhe interno e sem mock de módulo próprio.

Seams propostos, a confirmar:

- `convert()` na fachada: fluxo ponta a ponta com fixtures pequenas, golden files em `specs/`.
- Contrato `Converter`: o kit `anymark/testing` roda em todo converter, de fábrica ou plugin.
- Contrato `Backend`: o mesmo kit, mais CLI falso em `fixtures/bin/`. Chamada real só com `ANYMARK_LIVE=1`.
- `FormatDetectorChain`: bytes entram, formato sai, um caso por handler.
- `BackendChain`: backends falsos provam ordem, pulo, opt-in e `NoBackendError`.
- Plugin externo: o exemplo `.srt` registra sem alterar `src/`, e um teste prova isso.

Teste primeiro (casos definidos por uma pessoa): parsing, detecção de formato, escape do `MarkdownBuilder`, regras de opt-in e de segurança. Sem teste para CSS e layout do exemplo. Referência: kit de contrato descrito no PLAN.

## Fora de escopo

- Backend standalone, REST ou app executável como entrega. O exemplo Next.js é só consumidor de demonstração, sem deploy.
- Fine-tuning. Modelo ajustado de terceiro entra como `Backend`.
- RAG como parte do core. Componente opcional da segunda entrega.
- Extração e descrição por IA de imagens dentro de docx, pptx e pdf (só com opt-in, e depois do núcleo).
- Estrutura de PDF além de texto plano.
- Ler keychain ou token de outro programa, OAuth próprio.
- CJS, template de projeto e skill `/novo-projeto`.

## Notas

- Prazos: escopo do MVP congelado em 28/10, parcial apresentado em 29/10 (30% da nota), entrega em 12/11 às 23:59 BRT, alvo interno 20h.
- Padrões defendidos (4 de dupla, proporcional ao mínimo de 8 por grupo de 4): Adapter e Chain (Stopinski), Strategy/Registry e Builder (Bruno). Decorator e Observer são reservas.
- Pendências abertas que afetam este PRD: significado de "vincular" no RAG, aceitação de Chain, Registry e Facade pelo professor.
