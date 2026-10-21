# Exemplo Next.js

Consumidor de demonstração e interface de teste da lib: dropzone, opções (idioma, `includeHidden` e as do PDF escaneado: layout, rotação, lombada, limpeza), preview do Markdown com abas de metadata e avisos, e download do `.md`. Não é backend nem entrega do trabalho, e não tem deploy.

O formato `.srt` não existe na lib: entra por `createAnymark().use(srtPlugin)` em [lib/anymark.ts](lib/anymark.ts), com o plugin em [lib/srtPlugin.ts](lib/srtPlugin.ts) (cópia de `examples/plugins/srt` que importa de `anymark`).

## Rodar

```sh
yarn install
yarn setup      # sempre por último: um `yarn install` depois remove a lib instalada sem `--save`
yarn dev        # ou: yarn build && yarn start
```

Abra http://localhost:3000, envie um docx, pdf, xlsx, srt etc. Limite de 10 MB por arquivo e 30 s por conversão. É uma demo local: não tem limite de taxa nem proteção para uso público.

## Por que assim

- `public/brand/` e `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico` são cópias dos assets de `design/brand/` (logo, ilustração, sprite de ícones, favicon). A fonte é `design/brand/`: ao regerar lá, copie de novo.
- `serverExternalPackages` em [next.config.mjs](next.config.mjs): os conversores carregam WASM e leem arquivos em runtime, então ficam fora do bundle.
- `runtime = 'nodejs'` em [app/page.tsx](app/page.tsx): as dependências precisam de APIs do Node.
- Os erros da lib são genéricos de propósito (sem caminho nem conteúdo); a Server Action mostra a mensagem só de erros da lib e `Conversion failed.` para o resto.
