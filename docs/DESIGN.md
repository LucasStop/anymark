# Design do anymark

Identidade visual da interface de teste (`examples/nextjs`), do README e do vídeo. Decisões: [issue #104](https://github.com/LucasStop/anymark/issues/104). O protótipo em HTML (`design/prototype/`, a criar na issue #105) e a implementação em Tailwind + shadcn seguem este documento; se divergirem, este vence.

A referência é um vídeo de componente de formulário de outro estúdio: card claro sobre fundo escuro, dropzone, campos que se preenchem em sequência, aviso em âmbar, stepper. Aproveitamos o padrão de interação, não a marca: paleta, tipografia, textos e nome são do anymark.

## Princípios

1. **O arquivo é o protagonista.** A tela mostra o documento entrando e o Markdown saindo; o resto some.
2. **Aviso é informação, não alarme.** O `warnings` da lib aparece em âmbar, com o que fazer. Erro (vermelho) é só para falha que impede o resultado.
3. **Calmo e legível.** Muito espaço, uma cor de destaque, texto mono para o que é Markdown.
4. **Movimento explica estado.** Toda animação mostra uma mudança (soltou, leu, extraiu, terminou) e some com `prefers-reduced-motion`; o chip de estado continua visível para carregar a informação.
5. **Claro e escuro com o mesmo peso.** Os dois temas são de primeira classe, ambos com contraste AA.

## Cor

Neutros levemente frios, destaque verde-azulado ("tinta"), âmbar para atenção. Valores conferidos com a razão de contraste WCAG (mínimo 4,5:1 para texto).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#eef2f1` | `#0e1318` | fundo da página |
| `--paper` | `#ffffff` | `#161c23` | card, painéis |
| `--sunken` | `#f3f5f4` | `#1d252e` | dropzone, `pre`, campos |
| `--line` | `#d5dcdb` | `#2a343f` | bordas, divisores |
| `--ink` | `#16202a` | `#e8edf2` | texto (16,5:1 / 14,6:1) |
| `--muted` | `#566271` | `#9aa7b5` | texto secundário (6,2:1 / 7,0:1) |
| `--accent` | `#0b7a6b` | `#3ccfb7` | ação principal, foco, passo atual (5,2:1 / 8,8:1) |
| `--accent-on` | `#ffffff` | `#04201c` | texto sobre `--accent` |
| `--accent-soft` | `#eaf7f4` | `#12302c` | fundo de drag-over e seleção |
| `--warn` | `#8a4b00` | `#f2c46d` | texto de aviso |
| `--warn-bg` | `#fff4dc` | `#33290f` | fundo de aviso |
| `--error` | `#b3261e` | `#ff8f86` | falha (6,5:1 / 7,8:1 sobre `--paper`) |
| `--ok` | `#1b6b3a` | `#7fdc9c` | texto de sucesso |
| `--ok-bg` | `#e6f5ea` | `#12301e` | fundo de sucesso |

Regras: um único `--accent` por tela; cor nunca é o único sinal (aviso leva ícone e texto, passo concluído leva check); `--accent` sobre `--accent-soft` fica perto do mínimo (4,5:1 ou pouco mais): recalcular ao mudar qualquer um dos dois.

## Tipografia

- Texto: **Inter** (fallback `system-ui, sans-serif`).
- Código e Markdown: **JetBrains Mono** (fallback `ui-monospace, monospace`).

| Papel | Tamanho / peso | Observação |
|---|---|---|
| Título de página | 28 / 700 | `letter-spacing: -0.02em` |
| Título de seção | 18 / 600 | |
| Corpo | 15 / 400, linha 1,55 | |
| Rótulo de campo | 13 / 500 | |
| Microlabel | 11 / 600, caixa alta, `0.08em` | só para categorias ("ARQUIVO", "RESULTADO") |
| Mono | 13 / 400, linha 1,6 | saída Markdown, hashes |

## Forma, espaço e profundidade

- Espaçamento em múltiplos de 4 px (4, 8, 12, 16, 24, 32, 48).
- Raio: 8 px em campos e botões, 12 px em dropzone e painéis, 16 px no card principal, 999 px em pílulas e chips.
- Sombra do card: `0 12px 40px rgb(14 19 24 / 14%)` no claro; no escuro, borda `--line` e sombra mais curta. Sem sombra em elementos internos: a hierarquia vem de `--sunken` e `--line`.
- Foco visível: anel de 2 px `--accent` com 2 px de distância, em todo elemento interativo.
- Alvo de toque mínimo de 40 px.

## Movimento

| Momento | Animação | Duração |
|---|---|---|
| Arrastar sobre a dropzone | borda sólida e fundo `--accent-soft` | 150 ms |
| Ler o documento | faixa de varredura vertical sobre o arquivo | 1200 ms em laço |
| Extrair | realces nas linhas; blocos voam do arquivo para o painel | 400 ms, atraso escalonado de 120 ms |
| Escrever o resultado | texto aparece em sequência por bloco | 300 ms por bloco |
| Concluir | passo do stepper ganha check; botão de download liga | 200 ms |

Easing `cubic-bezier(0.2, 0, 0, 1)` para entrar, `ease-in` curto para sair. Com `prefers-reduced-motion: reduce`: sem varredura nem voo; os estados trocam por fade de 100 ms ou direto.

## Layout

Card único, duas colunas (esquerda: arquivo e opções; direita: resultado), largura máxima de 992 px. Abaixo de 800 px as colunas empilham. Stepper no topo: Enviar, Converter, Revisar (chaves `upload`, `convert`, `review`; a demo está em inglês até a issue #108).

Estados da tela: vazio, arrastando, lendo, resultado com avisos, resultado limpo, erro.

## Voz e texto

- Interface em **português do Brasil** por padrão, com inglês disponível (issue #108). Termos técnicos ficam como estão: Markdown, OCR, `spread`, `trim`.
- Frases curtas, verbo no infinitivo nos botões ("Converter", "Baixar .md").
- Aviso diz o que aconteceu e o que fazer: "Texto pouco legível na página 3. Confira com o original." A UI mapeia o `code` do `ConversionWarning` para o texto localizado; sem tradução para o `code`, mostra o `message` da lib como veio.
- Erro não ecoa conteúdo do arquivo nem caminho (mesma regra da lib).
- Sem emoji.

## Nome e marca

Wordmark em texto: `anymark` em minúsculas, Inter 700, com um cursor/underscore em `--accent` depois da palavra (`anymark_`), referência ao Markdown sendo escrito. Sem ícone separado nesta etapa; favicon é o `a_` no mesmo estilo.

## Mapeamento para o shadcn

Os nomes deste documento são semânticos; no tema do shadcn viram: `--bg` para `--background`, `--paper` para `--card` e `--popover`, `--ink` para `--foreground`, `--accent` para `--primary` e `--ring`, `--accent-on` para `--primary-foreground`, `--sunken` para `--muted`, `--muted` para `--muted-foreground` (no shadcn `--muted` é fundo, aqui é texto), `--line` para `--border` e `--input`, `--error` para `--destructive`. `--warn`, `--warn-bg`, `--ok` e `--ok-bg` não existem no shadcn e entram como tokens extras no `@theme`.

## Mapa de componentes

| Componente | Estados | Origem na lib |
|---|---|---|
| Card | padrão | n/a |
| Stepper | Enviar, Converter, Revisar | estado da conversão (`idle`, `pending`, `ok`, `error`) |
| Dropzone | vazia, arrastando, com arquivo, arquivo grande | `MAX_BYTES` |
| Campo e seletor | padrão, foco, desabilitado | `ConvertOptions` |
| Chip de estado | lendo, avisos (N), pronto | `pending`, `warnings` |
| Aviso | âmbar com ícone | `ConversionWarning` |
| Abas | Markdown, Metadata, Avisos | `ConversionResult` |
| Botão | primário, secundário, desabilitado | n/a |

## Anexo: análise do vídeo de referência

12 frames do card (cerca de 6 s). Sequência: estado vazio com stepper e botão desabilitado; arrasto com dropzone azul-claro; leitura com miniatura do documento e chip "Leyendo documento"; extração com realces azuis e âmbar sobre linhas e "etiquetas" voando para os campos; preenchimento com digitação sequencial; revisão com campo duvidoso em âmbar, aviso com botão "Esta bien", chip "2 datos por revisar", carimbo e stepper avançando. O botão de confirmar só liga quando os pendentes são resolvidos. Mapeamento: documento enviado vira Markdown; campo duvidoso vira aviso (`warnings`); chip de leitura vira estado `pending`.
