# 0002. `Converter` e `Backend` são interfaces distintas

Status: proposta (14/10/2026). Dono: Lucas Stopinski.

## Contexto

Dois eixos de variação: o formato do arquivo (docx, pdf, csv) e o provedor que faz um trabalho de IA (tesseract, Gemini, `claude -p`). Imagem e áudio dependem dos dois.

## Decisão

`Converter` (Strategy) transforma um formato em Markdown. `Backend` (Adapter) faz um trabalho de IA por trás de um contrato fixo (`capability`, `locality`, `isAvailable`, `run`). Nenhuma classe implementa as duas. Um `Converter` de imagem chama a `BackendChain`, nunca um provedor direto.

## Consequências

- Trocar o OCR não toca o converter de imagem. Adicionar um formato não toca nenhum backend.
- `Backend` tem vários adapters reais, então o seam se paga. `Converter` idem.
- A defesa de cada padrão fica em um lugar só, sem mistura.

## Alternativa descartada

Uma interface `Processor` única. Menos tipos, mas `if/else` por provedor dentro do converter (viola OCP) e Strategy e Adapter na mesma classe.
