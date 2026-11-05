# Roteiro do vídeo de defesa

Entrega final de 18/11/2026. O vídeo tem no máximo 10 minutos (Canvas) e cobre os três blocos do [ENUNCIADO](ENUNCIADO.md): visão geral, uso com extensão e defesa por padrão. Cada aluno defende 2 padrões. O vídeo mostra o rosto dos dois e é montado a partir de três trilhas gravadas separadas: a **tela** (código, terminal, testes), gravada por script no computador do Stopinski, e o **rosto e a voz** de cada um, com as falas exatas deste arquivo (ver "Como gravar"). O código é a prova de cada padrão (ver [PATTERNS.md](PATTERNS.md)). Marca, slides 16:9, lower thirds e miniatura: `design/brand/applications/`.

Estado mostrado: pacote no npm, `main` verde, texto, dados, Office, PDF, imagem por OCR, áudio por whisper.cpp ou API, vídeo por ffmpeg, página da web e YouTube, extensão `.srt` por plugin. Só citar como pronto o que tem teste na `main`; limites conhecidos estão em [DEFESA.md](DEFESA.md).

| # | Bloco | Quem fala | Tela | Palavras | Tempo |
|---|---|---|---|---|---|
| 1 | O que é a lib e para quê | Stopinski | cena 1 | 146 | 1:00 |
| 2 | Caso padrão: txt, docx, pdf, OCR | Stopinski | cena 2 | 140 | 1:30 |
| 3 | Extensão `.srt` sem tocar a lib | Bruno | cena 3 | 148 | 1:30 |
| 4 | Adapter e Chain of Responsibility | Stopinski | cena 4 | 222 | 2:00 |
| 5 | Strategy com Registry/Plugin, e Builder | Bruno | cena 5 | 215 | 2:00 |
| 6 | Facade, Decorator e Observer em uma passada | Stopinski e Bruno | cena 6 | 180 | 1:30 |
| 7 | Fechamento | Stopinski e Bruno | cena 7 | 69 | 0:30 |

Total: 10:00 de teto. A voz soma cerca de 1.120 palavras (uns 7:30 a 150 palavras por minuto); o resto é o tempo dos comandos rodando na tela. Alvo do vídeo pronto: 9:30. Os números de palavras são conferidos de novo ao mexer nas falas.

## Como gravar

Os dois aparecem no vídeo. São três trilhas gravadas separadas e juntadas na edição: a **tela** (código, terminal, testes), gravada só no computador do Stopinski, onde está o projeto; o **rosto e a voz do Stopinski**; e o **rosto e a voz do Bruno**, gravados por ele no computador dele.

**Layout.** Blocos 1 e 7: rosto de quem fala em tela cheia (no 7, o slide `slide-closing.png` entra no fim). Blocos 2 a 6: a tela ocupa o quadro e o rosto de quem fala fica num círculo no canto inferior direito, longe do terminal. O lower thirds (`lower-third-stopinski.png` e `lower-third-bruno.png`, de `design/brand/applications/`) entra nos 4 primeiros segundos de cada fala de cada pessoa. Abertura com `vignette.png` por 3 segundos.

**Tela, gravada por script (Stopinski).**

1. Uma vez: `yarn install`, `yarn build`. Libere a gravação de tela para o VS Code em Ajustes do Sistema, Privacidade e Segurança, Gravação de Tela.
2. Arrume a tela: VS Code com o editor em cima e o terminal integrado embaixo, fonte a partir de 18 pt, tema escuro. Feche as outras janelas e o que for pessoal: a gravação pega a tela inteira.
3. No terminal integrado do VS Code: `node scripts/demo.mjs gravar`. Ele prepara o plugin, roda as cenas de 1 a 7 sozinho, com uma pausa de 5 segundos entre os passos (`--pausa=N` muda), e grava cada uma em `gravacoes/cena-N.mov` (a pasta não vai para o git). Não mexa no mouse nem no teclado enquanto ele roda. `node scripts/demo.mjs gravar 4` refaz só a cena 4.
4. Veja cada `.mov`. As cenas saem um pouco longas de propósito: a voz manda no tempo e o corte é na edição.
5. A página do pacote no npm da cena 1 (https://www.npmjs.com/package/anymark) é gravada à mão, em separado.

Ensaio sem gravar: `node scripts/demo.mjs <n>` (avança por Enter), com `--auto` (pausas por tempo) ou `--sem-pausa`. `node scripts/demo.mjs` lista as cenas. Os passos "abrir" levam o VS Code direto à linha do código (`code -g`); os passos "$" rodam o comando de verdade.

**Rosto e voz (cada um, no seu computador).** Câmera na altura dos olhos, luz de frente, sala silenciosa, microfone próximo. Leia as falas abaixo exatamente como estão, um arquivo por bloco (`1-stopinski.mov`, `3-bruno.mov`, `6a-stopinski.mov`, `6b-bruno.mov` e assim por diante), olhando para a câmera. As falas já têm o tamanho do bloco (cerca de 150 palavras por minuto): não acrescente, não improvise. Errou uma frase, repita a frase. Termos em inglês (Adapter, Chain of Responsibility, Backend) se leem como se escrevem.

**Montagem.** A voz manda no tempo: ajuste a tela a cada bloco, acelerando ou cortando as pausas do terminal, e não o contrário.

## 1. O que é a lib (Stopinski, 1:00)

**Tela, cena 1.** Rosto em tela cheia na abertura (com a vinheta antes), depois a página do pacote no npm e `yarn info anymark version` (mostra `1.0.0`).

> **Stopinski:** Olá. Nós somos o Lucas Stopinski e o Lucas Bruno, e este é o trabalho final de Design Patterns. Apresentamos o anymark, uma biblioteca TypeScript que converte qualquer arquivo em Markdown. Com uma única chamada, você entrega o arquivo e recebe o texto em Markdown, pronto para três usos: contexto de um modelo de linguagem ou de um sistema de RAG, notas no Obsidian, ou simplesmente leitura humana. A biblioteca já está publicada no npm, na versão um ponto zero. O núcleo lê texto, dados, Office e PDF. Imagem, áudio, vídeo, páginas da web e YouTube entram por backends de inteligência artificial que podem ser trocados e têm fallback. O que vamos defender aqui não é a quantidade de formatos, e sim a arquitetura: oito padrões de projeto, cada um com o problema que resolve, o trecho de código que prova e a alternativa que descartamos.

## 2. Caso padrão (Stopinski, 1:30)

**Tela, cena 2.** Quatro passos: um txt, um docx, um pdf e uma imagem. Em cada um aparecem o Markdown, o tipo detectado, o `sourceId` e os avisos. Plano B: a interface do `examples/nextjs` (`yarn setup` e `yarn dev`, porta 3000, ver [o README do example](../examples/nextjs/README.md)).

> **Stopinski:** Vamos ao uso padrão. Eu crio uma instância com createAnymark e chamo convert, passando os bytes do arquivo e o nome. Primeiro, um arquivo de texto: sai o Markdown, e o tipo detectado é texto puro. Agora um documento do Word: o título vira cabeçalho e a estrutura se mantém. Um PDF com texto: cada página vira uma seção. E uma imagem: aqui a biblioteca usa reconhecimento de caracteres, o OCR, e devolve o texto que estava na figura. Repare que eu nunca disse qual formato era cada arquivo. A biblioteca detecta pelo conteúdo, não só pela extensão. Na saída também vêm os metadados. O sourceId é o hash do conteúdo, então o mesmo arquivo sempre gera o mesmo identificador. E os avisos nunca trazem caminho de arquivo nem dado do usuário, porque tratamos todo documento como dado não confiável.

## 3. Extensão `.srt` (Bruno, 1:30)

**Tela, cena 3.** Abre `examples/plugins/srt/index.ts` na linha do `srtPlugin`; depois roda o script: primeiro sem o plugin, depois com `createAnymark().use(srtPlugin)`.

> **Bruno:** Agora a parte que mais importa para quem quer usar a biblioteca: estender sem mexer nela. Aqui está um arquivo de legendas, o formato SRT. Sem nenhum plugin, a biblioteca só o lê como texto simples, com números e tempos misturados ao que foi dito. Este é o plugin, em um arquivo fora da pasta src. Ele exporta um objeto com um nome e um método install. Dentro dele, registramos um conversor novo: o tipo, a extensão ponto srt e uma função load, que cria o conversor só quando alguém precisar. Para ligar, é uma linha: createAnymark ponto use, srtPlugin. Rodando de novo, cada legenda virou um parágrafo, com o horário em negrito. Nenhum arquivo da biblioteca mudou. E um cuidado de segurança: o texto de uma legenda é dado não confiável, então o plugin remove marcações HTML e neutraliza links e imagens antes de escrever o Markdown.

## 4. Adapter e Chain of Responsibility (Stopinski, 2:00)

**Tela, cena 4.** Abre em sequência: o contrato `Backend` em `types.ts`, `TesseractBackend`, `WhisperBackend`, o `from` da `BackendChain`, `FormatHandler` e `SignatureHandler`. Depois roda `node examples/fallback.mjs` e o teste da `BackendChain`.

> **Stopinski:** Meu primeiro padrão é o Adapter. O problema: cada provedor de inteligência artificial fala uma língua diferente. O Tesseract é WebAssembly, o Whisper é um programa de linha de comando, o Gemini e o OpenAI são APIs na rede. O resto da biblioteca não pode saber disso. A solução é este contrato, Backend: um nome, uma capacidade, como OCR ou transcrição, uma localidade, que pode ser local, linha de comando ou remota, e dois métodos, isAvailable e run. Aqui o TesseractBackend e aqui o WhisperBackend implementam o mesmo contrato, e o conversor de imagem só pede OCR e recebe texto. A alternativa que descartamos foi um if e else por provedor dentro do conversor: cada provedor novo obrigaria a editar o conversor. Meu segundo padrão é a Chain of Responsibility. Na BackendChain, cada elo decide: trato ou passo adiante. Pula o backend que não tem a capacidade, que não foi autorizado ou que está indisponível, e chama o próximo. A detecção de formato usa a mesma ideia: cada handler responde com o tipo ou chama next. Ao vivo: um backend que falha vem antes de um que funciona, o segundo entrega o resultado, e o erro vira só um aviso, sem caminho nem mensagem interna. A alternativa descartada foi um laço for com ifs dentro: não se estende sem editar o laço.

## 5. Strategy, Registry/Plugin e Builder (Bruno, 2:00)

**Tela, cena 5.** Abre a interface `Converter`, a linha do `registry.resolve` em `Anymark.ts`, o `register` e o `load` do `ConverterRegistry`, a classe `MarkdownBuilder` e a função `cell`. Roda os testes do builder e do plugin.

> **Bruno:** Eu defendo Strategy, Registry com Plugin, e Builder. Strategy: cada formato converte de um jeito. A interface Converter tem um nome, os tipos que atende e um método convert. Uma classe por formato: PdfConverter, DocxConverter e assim por diante. A fachada detecta o tipo, pede ao registry o conversor certo e chama convert, sem saber qual é. A alternativa descartada foi um switch sobre o tipo: cada formato novo editaria a função, e todos os parsers ficariam acoplados. Registry e Plugin: o ConverterRegistry guarda os conversores por tipo, e o registro é por instância, nunca global. Duas instâncias não compartilham estado e um teste não contamina o outro. O método load carrega o conversor só na primeira vez que ele é pedido, então quem só usa CSV não paga pelo PDF. A alternativa descartada foi um registry estático global, em que um plugin vira efeito colateral de import. Por fim, o Builder. Escapar uma barra vertical dentro de uma tabela, aninhar listas, separar blocos: isso é frágil se cada conversor concatena texto. O MarkdownBuilder oferece uma interface fluente, com heading, paragraph, list e table, e concentra o escape em um único lugar, esta função cell. Os conversores só descrevem a estrutura. A alternativa descartada: concatenar strings em cada conversor, e repetir o escape dez vezes.

## 6. Facade, Decorator e Observer (os dois, 1:30)

**Tela, cena 6.** Abre `Anymark.convert`, a linha do `reduceRight` e a interface `ResultSink`; roda `examples/demo/passada.mjs`, que mostra o progresso, o front matter, os pedaços (`chunks`), o aviso `SINK_FAILED` e as métricas.

> **Stopinski:** Os três últimos padrões, em uma passada. A Facade é o Anymark: uma chamada, convert, esconde a detecção de formato, o registry, a cadeia de backends e a identidade do resultado. Quem usa a biblioteca não monta nada disso. O Decorator embrulha qualquer conversor atrás da mesma interface e acrescenta algo ao resultado. Aqui, o ChunkingDecorator corta o texto em pedaços para RAG, e o FrontMatterDecorator põe um cabeçalho YAML para o Obsidian. Eles se empilham com decorate, e nenhum dos conversores sabe que existem. A alternativa seria uma opção em cada conversor, e todo plugin novo teria que implementar as duas.
>
> **Bruno:** O Observer. Quem usa a biblioteca quer acompanhar o que acontece, em log, métrica ou barra de progresso, sem que a biblioteca conheça esse consumidor. Com addSink, registramos quantos observadores quisermos, que implementam a interface ResultSink: um método para o progresso e outro para o resultado. Veja que cada sink recebeu o evento, e que um sink que lança erro foi pulado: a conversão continuou, e o resultado ganhou só o aviso SINK_FAILED, sem a mensagem do erro.

## 7. Fechamento (os dois, 0:30)

**Tela, cena 7.** O `yarn test` completo e o teste com os programas reais (`ANYMARK_LIVE=1`); em seguida o slide de fechamento.

> **Stopinski:** O anymark está no npm, na versão um ponto zero, com quase quinhentos testes passando, incluindo testes com o whisper, o ffmpeg e o yt-dlp de verdade.
>
> **Bruno:** Usamos o Claude Code como apoio no desenvolvimento, como o README declara. E dizemos os limites como são: o review cruzado entre nós dois foi pequeno, e a proteção contra DNS rebinding na busca de páginas está documentada como limite conhecido. Obrigado.

## Ensaio

Marcar cada item só depois de rodar de fato.

- [ ] `node scripts/demo.mjs gravar` roda as 7 cenas sem erro e gera `gravacoes/cena-1.mov` a `cena-7.mov`, todos abrindo e legíveis (a cena 7 usa o modelo `ggml-medium.bin` em `~/whisper-models`, ou `ANYMARK_WHISPER_MODEL`).
- [ ] Ler cada fala em voz alta com cronômetro: cada bloco dentro do tempo da tabela, total de até 10:00.
- [ ] Demo do example do zero em máquina limpa: `yarn install`, `yarn setup`, `yarn dev`, os quatro arquivos do caso padrão mais um `.srt`.
- [ ] `yarn add anymark` num projeto vazio com a versão publicada e rodar o plano B do bloco 2.
- [ ] `yarn test test/BackendChain.test.ts` ao vivo, saída legível.
- [ ] Cada um responde em voz alta "problema, onde está no código, alternativa descartada" dos seus padrões, sem consultar.
- [ ] Plano B se o Next falhar: terminal com `node scripts/manual-run.mjs` ou o plano B por código, e o PATTERNS aberto.
- [ ] Publicar no YouTube como não listado e colocar o link no README.
