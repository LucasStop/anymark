# Exemplo Next.js

Consumidor de demonstração da lib: upload de um arquivo, preview do Markdown e download do `.md`. Não é backend nem entrega do trabalho, e não tem deploy.

O formato `.srt` não existe na lib: entra por `createAnymark().use(srtPlugin)` em [lib/anymark.ts](lib/anymark.ts), com o plugin em [lib/srtPlugin.ts](lib/srtPlugin.ts) (cópia de `examples/plugins/srt` que importa de `anymark`).

## Rodar

```sh
npm install
npm run setup   # npm pack na raiz e instala o tarball aqui, como um consumidor faria
npm run dev     # ou: npm run build && npm start
```

Abra http://localhost:3000, envie um docx, pdf, xlsx, srt etc. Limite de 10 MB por arquivo.

## Por que assim

- `serverExternalPackages` em [next.config.mjs](next.config.mjs): os conversores carregam WASM e leem arquivos em runtime, então ficam fora do bundle.
- `runtime = 'nodejs'` em [app/page.tsx](app/page.tsx): as dependências precisam de APIs do Node.
- Os erros da lib são genéricos de propósito (sem caminho nem conteúdo); a Server Action mostra a mensagem só de erros da lib e `Conversion failed.` para o resto.
