# PRD ▸ Fix Detail‑Query to Use Category Table’s `descricao`

After drilling down, the API’s MySQL query incorrectly filters on `cp.categoria_descricao`, but that column lives in the joined `omie_categorias_api` table as `cat.descricao`. We must adjust the SQL to join that table and filter on its `descricao` column.

---
## 1  Problem
- Current detail SQL (in `lib/despesaDetails.ts`) uses:
  ```sql
    AND cp.categoria_descricao = ?
  ```
- But no such column exists in `omie_contas_pagar_api` (`cp`).  The correct `categoria_descricao` comes from:
  ```sql
    LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo
      AND cp.nome_projeto = cat.nome_projeto
  ```
  and is referenced as `cat.descricao`.

This mismatch means the `WHERE` never matches any rows, so the modal is empty.

---
## 2  Solution
In **`lib/despesaDetails.ts`**, modify the SQL to:
1. **Join** the `omie_categorias_api` table as alias `cat`.
2. **Filter** on `cat.descricao = ?` instead of `cp.categoria_descricao = ?`.

### 2.1  Add the JOIN
Locate the `FROM omie_contas_pagar_api cp` block and insert:
```diff
 FROM omie_contas_pagar_api cp
-   LEFT JOIN omie_clientes_api cl ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
+   LEFT JOIN omie_clientes_api cl ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
+  -- join to get categoria_descricao
+   LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo
+     AND cp.nome_projeto = cat.nome_projeto
```

### 2.2  Change the WHERE clause
Find:
```sql
  AND cp.categoria_descricao = ?
```
and replace with:
```diff
- AND cp.categoria_descricao = ?
+ -- filter by the joined category description
+ AND cat.descricao = ?
```

### 2.3  Full SQL after change
```sql
SELECT
  DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%d/%m/%Y'), '%Y-%m-%d') AS data_entrada,
  cl.nome_fantasia                                       AS fornecedor_fantasia,
  cp.valor_documento                                     AS valor_documento
FROM omie_contas_pagar_api cp
LEFT JOIN omie_clientes_api cl
  ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
LEFT JOIN omie_categorias_api cat
  ON cp.codigo_categoria = cat.codigo
  AND cp.nome_projeto = cat.nome_projeto
WHERE DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%d/%m/%Y'), '%Y-%m') = ?
  AND CONCAT(SUBSTRING_INDEX(cp.codigo_categoria,'.',2), ' + ', ?) = ?
  AND cat.descricao = ?
  AND cp.status_titulo != 'CANCELADO'
ORDER BY cp.valor_documento DESC
LIMIT 300;
```

---
## 3  Code patch in `lib/despesaDetails.ts`
```diff
-  const sql = `
+  const sql = `
     SELECT
       DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%d/%m/%Y'), '%Y-%m-%d') AS data_entrada,
       cl.nome_fantasia                                                   AS fornecedor_fantasia,
       cp.valor_documento                                                 AS valor_documento
     FROM omie_contas_pagar_api cp
-    LEFT JOIN omie_clientes_api cl ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
+    LEFT JOIN omie_clientes_api cl ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
+    LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo
+      AND cp.nome_projeto = cat.nome_projeto
     WHERE DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%d/%m/%Y'), '%Y-%m') = ?
       AND CONCAT(SUBSTRING_INDEX(cp.codigo_categoria,'.',2), ' + ', ?) = ?
-      AND cp.categoria_descricao = ?
+      AND cat.descricao = ?
       AND cp.status_titulo != 'CANCELADO'
     ORDER BY cp.valor_documento DESC
     LIMIT 300`;
```

---
## 4  Validate
1. Restart server and click a leaf expense → modal now lists rows.  
2. Confirm `cat.descricao` matches the clicked category.  
3. Try category with no matching rows → modal empty gracefully.

Once patched, your drill‑down popup will correctly fetch and show the underlying expenses by category.

