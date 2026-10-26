# 0005. Opt-in de CLI e rede, e `spawn` único

Status: aceita (implementada; proposta em 14/10/2026). Dono: Lucas Stopinski.

## Contexto

Backends chamam CLIs de IA já logados e APIs remotas. O conteúdo do documento e a saída do modelo são dado não confiável (prompt injection). Backends que usam a conta ativa de um CLI gastam quota e só valem para uso pessoal local.

## Decisão

- Backend `cli` só roda com `allowCli`, e `remote` só com `allowNetwork`. Ambos desligados por padrão.
- Todo processo filho passa por um único módulo `spawn`: `execFile` com array de argumentos, sem shell, entrada copiada para diretório temporário com nome fixo, `timeout`, `signal`, `maxBuffer`, env em allowlist e limpeza no `finally`.
- Credencial só por variável de ambiente ou parâmetro. Nunca ler keychain ou token de outro programa, nunca OAuth próprio.
- Metadata e log não carregam caminho absoluto, chave nem dado do usuário.

## Consequências

- Uma falha de segurança é corrigida em um lugar. `spawn` e os backends passam por `/security-review` antes do merge.
- Teste não gasta quota: CLI falso em `fixtures/bin/`, chamada real só com `ANYMARK_LIVE=1` (convenção; ainda não há teste live).
- O custo é um módulo a mais que todo adapter de CLI precisa usar.

## Alternativa descartada

Cada adapter chama `execFile` por conta própria. Menos indireção, mas timeout, limpeza e allowlist se repetem e divergem.
