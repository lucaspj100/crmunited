# F3-B.3b (R3) — reconhecer `attempt_revoked` como HTTP 409

## O que fazer

Duas mudanças mínimas, só no mapeamento de erro → status HTTP e no teste que o cobre.

1. **`src/lib/whatsapp-campaigns.ts`** — dentro de `httpStatusFor()`, incluir `attempt_revoked` no mesmo bloco de casos que devolvem **409** (hoje: `campaign_not_active`, `reservation_mismatch`, `already_sending`, `already_finalized`, `attempt_mismatch`, `not_claimed`, `reserved_by_other_account`, `reservation_expired`, `already_sent`, `invalid_status`). Nenhum outro caso, ordem ou retorno muda.

2. **`src/lib/whatsapp-campaigns.test.ts`** — confirmar por teste que `httpStatusFor("attempt_revoked")` retorna **409**:
   - incluir `"attempt_revoked"` na lista já usada pelo teste "erros da F3-B mapeiam para 409/404";
   - adicionar uma asserção explícita, individual, para que a regra R3 fique identificável no teste.

## Como fica

```text
case "not_claimed":
case "reserved_by_other_account":
case "reservation_expired":
case "already_sent":
case "invalid_status":
case "attempt_revoked":   // F3-B.3b (R3): migration 0011 revoga a tentativa
  return 409;
```

## Verificação

- `bunx vitest run src/lib/whatsapp-campaigns.test.ts` (e a suíte completa para garantir que nada regressou).
- Typecheck com `tsgo`.
- Conferir o log de build do preview.

## Arquivos alterados

- `src/lib/whatsapp-campaigns.ts`
- `src/lib/whatsapp-campaigns.test.ts`

## Fora do escopo (não será tocado)

- Migrations (nenhuma migration 0011 será criada nem aplicada) e qualquer SQL de escrita.
- Banco de produção, políticas de permissão.
- Rotas `claim`, `unclaim`, `sent`, `failed` e demais rotas de campanhas.
- Extensão Chrome.
- Publicação/deploy, commit ou push.
- Qualquer outro arquivo.

## Observação

Sem a migration 0011 no banco, `attempt_revoked` ainda não é devolvido por nenhuma função — esta mudança apenas prepara o CRM para responder 409 quando ela existir.
