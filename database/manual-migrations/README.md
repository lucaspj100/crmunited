# Migrations manuais do CRM United

Este diretório documenta mudanças de banco **aplicadas manualmente pelo SQL Editor do Lovable**.
**Nada aqui é executado automaticamente**: o Drizzle deste projeto lê apenas `drizzle/migrations/`.

> ## ⚠ AVISO — proteções que o histórico do Drizzle NÃO conhece
>
> O estado real do banco de produção **não** é o que `drizzle/migrations/` descreve. As migrations
> manuais **MAN-0010-R1** e **MAN-0011-R3** substituem ou acrescentam proteções que **não aparecem** em
> nenhuma migration do Drizzle:
>
> - `wa_campaign_claim` e `wa_campaign_unclaim`: a versão vigente é a da **MAN-0011-R3** (recusa `attempt_revoked`).
>   A versão em `drizzle/migrations/0008_*` está **superada**.
> - As guardas de `whatsapp_campaign_contacts` e `whatsapp_campaigns` (MAN-0010-R1) impedem reenvio, falsificação
>   de histórico e exclusão de contatos com histórico. `wcc_schema_guard` **recusa toda importação de contatos**
>   se uma coluna for adicionada a `whatsapp_campaign_contacts`.
>
> **Uma migration futura gerada pelo Lovable (ou pedida a ele) a partir das definições de `drizzle/migrations/`
> pode desfazer essas proteções sem nenhum aviso** — por exemplo, um `CREATE OR REPLACE FUNCTION wa_campaign_claim`
> baseado na 0008. Antes de pedir qualquer mudança em `whatsapp_campaigns`, `whatsapp_campaign_contacts`,
> `whatsapp_campaign_revoked_attempts` ou nas funções `wa_campaign_*`, `wa_f4_*` e `wa_campaigns_*`, consulte
> `ESTADO_ATUAL_OBJETOS.md`. **Depois de qualquer migration do Lovable**, rode P6, P7, P17 e P19 (somente leitura,
> em `verificacoes/` e `0012-F4-0a/`): regressão em qualquer uma indica que uma proteção manual foi sobrescrita.

## Por que fica fora de `drizzle/migrations/`

- `drizzle.config.ts` define `out: "./drizzle/migrations"`. O executor (`drizzle-orm` 0.45.2, versão do CRM) lê
  somente `drizzle/migrations/meta/_journal.json` e os arquivos ali listados; arquivos em outras pastas nunca são executados.
- O executor aplica **todas** as entradas pendentes do journal numa única transação e registra cada uma em
  `drizzle.__drizzle_migrations`. As migrations deste diretório **já estão no banco**: colocá-las no journal faria o
  Drizzle tentar aplicá-las de novo, ou deixaria o journal incoerente com o banco.
- Detalhes: `HISTORICO_DRIZZLE_vs_PRODUCAO.md`.

## Regras

1. **Identificador** (convenção D16, adotada em 19/10/2026): `MAN-NNNN-<fase>`, sempre completo — `MAN-0010-R1`, `MAN-0011-R3`, `MAN-0012-F4-0a`. O Drizzle numera pela
   posição no journal, e a próxima migration gerada pelo Lovable será `drizzle/migrations/0010_*`; o prefixo `MAN-`
   evita confundir as duas séries.
2. **Imutabilidade:** cada arquivo é guardado exatamente como foi aplicado ou verificado. `SHA256SUMS` permite
   conferir com `sha256sum -c SHA256SUMS`. Correção vira **nova** migration manual, nunca edição.
3. **Prova:** cada entrada de `INDICE.md` aponta a verificação somente leitura que compara o banco com o arquivo e a
   evidência de produção em `evidencias/` (sem dados pessoais).
4. **Arquivos ausentes não são reconstruídos aqui.** O rollback original da MAN-0010-R1 não foi recuperado e está
   registrado como ausente.

## Conteúdo

| Caminho | O que é |
| --- | --- |
| `INDICE.md` | Uma linha por migration: SHA-256, aplicação, prova, situação |
| `HISTORICO_DRIZZLE_vs_PRODUCAO.md` | O que o Drizzle registra × o que existe no banco |
| `ESTADO_ATUAL_OBJETOS.md` | Objetos cuja definição vigente **não** é a de `drizzle/migrations/` |
| `0010-R1_*.sql`, `0011-R3_v4_*.sql` | Cópias exatas dos arquivos aplicados |
| `0012-F4-0a/` | Bloco único aplicado, camada 1 aplicada, fonte `BEGIN/COMMIT` (não aplicada), rollback 2–4 (não aplicados), verificador de estado, fotografia e P19 |
| `verificacoes/` | P6, P7, P8, P17 (somente leitura) |
| `evidencias/` | Resultados de produção de P6, P7, P17 e P19 (catálogo; sem dados pessoais) |
| `SHA256SUMS` | Hashes de todos os arquivos deste diretório (exceto ele mesmo) |
