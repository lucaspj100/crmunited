# Histórico do Drizzle × estado real do banco de produção (19/10/2026)

| Fonte | O que registra | Como foi verificado |
| --- | --- | --- |
| `drizzle/migrations/meta/_journal.json` | 10 entradas, `0000`–`0009` (18/09 a 06/10/2026; última `when = 1791313321531`) | Lido no repositório, HEAD `99cb303` |
| `drizzle.__drizzle_migrations` (produção) | 10 registros, correspondentes a `0000`–`0009` | Item 50 da fotografia de 19/10/2026 (relatado pelo responsável) |
| Banco de produção | **Além** de `0000`–`0009`: MAN-0010-R1, MAN-0011-R3 v4, MAN-0012-F4-0a (+ camada 1) | P7 (0010), P6 (0011), P19 (0012) — ver `INDICE.md` |

## Consequências

1. **O Drizzle não sabe que MAN-0010-R1, MAN-0011-R3 e MAN-0012-F4-0a existem.** Para ele, o banco está na `0009`.
2. **Próxima migration do Lovable:** será a entrada de índice 10 do journal (`drizzle/migrations/0010_<nome>.sql`).
   O executor a aplicará porque o `when` dela será maior que `1791313321531`. Ela **não** colide em arquivo com este
   diretório, mas colide em **número** com MAN-0010-R1 — daí o prefixo `MAN-`.
3. **Risco de sobrescrita:** se essa migration recriar objetos que as manuais alteraram (ver `ESTADO_ATUAL_OBJETOS.md`),
   o banco volta a uma versão anterior **sem que o Drizzle acuse nada**.
4. **Não registrar as manuais no journal.** Isso exigiria inserir linhas em `drizzle.__drizzle_migrations` à mão e
   criar entradas com `when` intermediário; o executor compara só com o **último** `created_at` e poderia pular ou
   repetir migrations. Nenhuma alteração no journal ou na tabela do Drizzle é feita ou proposta aqui.

## Fato do executor (`drizzle-orm` 0.45.2, `pg-core/dialect.js`, função `migrate`)

```text
CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id, hash, created_at)
SELECT ... ORDER BY created_at DESC LIMIT 1            -- só o último registro
BEGIN
  para cada entrada do journal com when > último created_at:
    executa os comandos do arquivo; INSERT INTO __drizzle_migrations (hash, created_at)
COMMIT
```

Não verificado: se o Lovable invoca exatamente essa função (hipótese compatível com o registro de 10 linhas observado).
