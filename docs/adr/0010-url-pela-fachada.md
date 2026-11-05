# 0010. URL pela fachada, com guarda de SSRF

Status: aceita (implementada em 05/11/2026). Dono: Lucas Stopinski.

## Contexto

O `Converter` transforma bytes em Markdown. Uma URL não é bytes: antes é preciso buscar a página, e buscar é rede, com opt-in, redirecionamento e risco de SSRF (um link que aponta para `169.254.169.254` ou para `localhost`). O conteúdo da página é dado não confiável.

## Decisão

- `Anymark.convertUrl(url, options)` na fachada: busca com `fetchUrl` e entrega os bytes ao pipeline normal. Não existe `UrlConverter`: um `Converter` receberia bytes, não a URL.
- `fetchUrl` (`src/security/urlFetch.ts`) é o único ponto de busca de página: `allowNetwork` antes de qualquer consulta DNS, só `http` e `https`, sem credencial na URL, hosts privados, de loopback e de link-local recusados na URL e em cada redirecionamento (no máximo 5, seguidos à mão), limite de tamanho (25 MB), tempo (30 s) e `signal`. `allowPrivateHosts` abre a guarda para testes e intranet.
- HTML passa por `@mozilla/readability` sobre `linkedom` (nenhum script roda, nada é buscado) e cai no `HtmlConverter`. Sem artigo reconhecível, converte a página inteira e avisa `URL_NOT_ARTICLE`. Outro content-type vai para o converter do próprio tipo.
- A URL nunca entra em erro, metadata ou log: a query costuma carregar token.

## Consequências

- Duas dependências novas (Apache-2.0 e ISC), carregadas sob demanda.
- Limite conhecido: o nome é resolvido na checagem e de novo pelo `fetch`; um DNS que troca a resposta entre as duas consultas (rebinding) passa. Fechar isso exige fixar o IP resolvido num dispatcher próprio.
- YouTube fica fora (#171): precisa ler o arquivo que o `yt-dlp` gera.

## Alternativa descartada

`UrlConverter` registrado por mime: o `Converter` não recebe a URL e a busca de rede ficaria escondida dentro de uma conversão de bytes, sem o ponto único de guarda.
