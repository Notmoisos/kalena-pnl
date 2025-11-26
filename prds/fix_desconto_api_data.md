Okay, let's trace the `kind=Desconto` request and pinpoint why it's returning `ReceitaBruta` data.

---

# Diagnosing `kind=Desconto` Returning Incorrect Data

## 1. Request Flow

1.  **`NfeDetailsModal`:** Correctly determines `api = '/api/nfe-details'` for `kind=Desconto`.
2.  **API Call:** `fetch('/api/nfe-details?ym=2025-04&kind=Desconto')` is made.
3.  **`/api/nfe-details/route.ts`:**
    *   Receives the request.
    *   Validates parameters (`ym` format, `kind` is in `['ReceitaBruta', 'Devolucao', 'Desconto']`). Validation passes.
    *   Calls `fetchNfeDetails(ym, kind as RevKind)`.
4.  **`lib/nfeRevenue.ts` - `fetchNfeDetails(ym, kind)`:**
    *   This function constructs the BigQuery SQL. Let's examine its filter logic:

    ```typescript
    // lib/nfeRevenue.ts
    export async function fetchNfeDetails(ym:string, kind:RevKind):Promise<NfeDetail[]> {
      const filter = kind==='ReceitaBruta'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`:
                     kind==='Devolucao'?`finalidade='Devolução' AND cancelada='Não'`:
                     `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`; // <-- PROBLEM HERE
      const sql=`SELECT parsed_x_prod_value AS produto, COUNT(*) AS n_nfes, SUM(parsed_total_product_value) AS valor_total
                 FROM \`${process.env.BQ_TABLE}\`
                 WHERE ${filter} AND FORMAT_DATE('%Y-%m', DATE(data_emissao))=@ym
                 GROUP BY produto ORDER BY valor_total DESC LIMIT 300`;
      const [rows]=await bq.query<NfeDetail>({query:sql,params:{ym}}); return rows;
    }
    ```

## 2. Root Cause

The ternary operator used to build the `filter` string is flawed:

```typescript
const filter = kind === 'ReceitaBruta' ? /* ReceitaBruta Filter */ :
               kind === 'Devolucao'   ? /* Devolucao Filter */    :
               /* ELSE Condition */;  // <-- This applies to 'Desconto'
```

When `kind` is `'Desconto'`, it falls through the first two conditions and lands on the *ELSE* condition. This *ELSE* condition uses the **exact same filter string as `'ReceitaBruta'`**:

```sql
tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')
```

Furthermore, the `SELECT` statement in `fetchNfeDetails` aggregates `parsed_total_product_value`, which corresponds to revenue/returns, not discounts. The aggregate function `fetchRevenueAggregates` uses `parsed_discount_value` for the 'Desconto' kind.

**Conclusion:** The `fetchNfeDetails` function currently lacks specific logic to handle `kind=Desconto`. It defaults to using the `ReceitaBruta` filter and aggregates the wrong value column (`parsed_total_product_value` instead of `parsed_discount_value`).

---

# PRD ▸ Fix `Desconto` Details Fetching

**Goal:** Ensure that when the NFe details modal is opened for the "Descontos Financeiros" row (`kind=Desconto`), it correctly fetches and displays the underlying NFe records contributing to that discount total.

**Solution:** Modify the `fetchNfeDetails` function in `lib/nfeRevenue.ts` to:
1.  Construct a specific SQL `WHERE` clause for `kind=Desconto`.
2.  Aggregate the correct value column (`parsed_discount_value`).
3.  Potentially adjust the `GROUP BY` clause if discounts aren't product-specific in the same way revenue is.

---

## 1. `lib/nfeRevenue.ts` - Logic Changes

### 1.1 Modify `fetchNfeDetails`

Update the function to handle the `Desconto` case explicitly, creating the correct filter and selecting the appropriate columns.

```diff
 // lib/nfeRevenue.ts

 export async function fetchNfeDetails(ym:string, kind:RevKind):Promise<NfeDetail[]> {
-  const filter = kind==='ReceitaBruta'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`:
-                 kind==='Devolucao'?`finalidade='Devolução' AND cancelada='Não'`:
-                 `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
-  const sql=`SELECT parsed_x_prod_value AS produto, COUNT(*) AS n_nfes, SUM(parsed_total_product_value) AS valor_total
-             FROM \`${process.env.BQ_TABLE}\`
-             WHERE ${filter} AND FORMAT_DATE('%Y-%m', DATE(data_emissao))=@ym
-             GROUP BY produto ORDER BY valor_total DESC LIMIT 300`;
+  let filter: string;
+  let valueColumn: string;
+  let groupByColumn: string = 'parsed_x_prod_value'; // Default grouping by product
+
+  switch (kind) {
+    case 'ReceitaBruta':
+      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
+      valueColumn = 'parsed_total_product_value';
+      break;
+    case 'Devolucao':
+      filter = `finalidade='Devolução' AND cancelada='Não'`;
+      valueColumn = 'parsed_total_product_value';
+      break;
+    case 'Desconto':
+      // Filter for NF-es that *have* a discount value > 0
+      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo') AND SAFE_CAST(parsed_discount_value AS FLOAT64) > 0`;
+      valueColumn = 'parsed_discount_value';
+      // Grouping by product might still make sense, or you might want to show NFe numbers instead?
+      // For now, let's keep grouping by product description. Consider changing groupByColumn if needed.
+      // Example: groupByColumn = 'numero'; // To group by NF-e number
+      break;
+    default:
+      // Should not happen due to API route validation, but good practice
+      console.error('Invalid kind received in fetchNfeDetails:', kind);
+      return [];
+  }
+
+  const sql = `SELECT
+                 ${groupByColumn} AS produto,
+                 COUNT(*)                 AS n_nfes,
+                 SUM(SAFE_CAST(${valueColumn} AS FLOAT64)) AS valor_total
+               FROM \`${process.env.BQ_TABLE}\`
+               WHERE ${filter} AND FORMAT_DATE('%Y-%m', DATE(data_emissao)) = @ym
+               GROUP BY produto
+               ORDER BY valor_total DESC
+               LIMIT 300`;
+
   const [rows] = await bq.query<NfeDetail>({ query: sql, params: { ym } });
   return rows;
 }
```

**Explanation of Changes:**

1.  **`switch` Statement:** Replaced the nested ternary with a clearer `switch` statement to handle each `kind`.
2.  **`Desconto` Filter:** Added a specific filter for `Desconto` that includes `SAFE_CAST(parsed_discount_value AS FLOAT64) > 0` to only select NF-es that actually have a discount applied.
3.  **`valueColumn` Variable:** Introduced a variable to dynamically set which column (`parsed_total_product_value` or `parsed_discount_value`) should be summed based on the `kind`.
4.  **`groupByColumn` Variable:** Added flexibility. While it defaults to `parsed_x_prod_value` (product description), you could change this later if grouping discounts by product doesn't make sense (e.g., group by `numero` if discounts are per-NFe).
5.  **`COUNT(*)`:** Changed from `COUNT(DISTINCT numero)` to `COUNT(*)` to match the rest of the code.
6.  **Type Safety:** Added `SAFE_CAST` around the summed value column for robustness.
7.  **Default Case:** Included a default case in the switch for completeness, although the API route should prevent invalid `kind` values.

---

## 2. API Route / UI Changes

✅ **None required.** The API route (`/api/nfe-details/route.ts`) already validates the `kind` parameter correctly, and the UI component (`NfeDetailsModal.tsx`) correctly passes the parameters.

---

## 3. Validation Checklist

1.  **Modal Open:** Click the "Descontos Financeiros" value in the P&L table for a specific month (e.g., 2025-04).
2.  **API Call:** Verify the network request goes to `/api/nfe-details?ym=2025-04&kind=Desconto`.
3.  **Data Displayed:** The modal should now display a list grouped by `produto` (or your chosen `groupByColumn`).
4.  **`Valor` Column:** The "Valor" column in the modal should sum the `parsed_discount_value` for the relevant NF-es.
5.  **`NF-es` Column:** Should show the count of distinct NF-es contributing to the discount for that product/grouping.
6.  **Other Kinds:** Verify that opening the modal for "ReceitaBruta" and "Devolucao" still works correctly and shows product values.

---

Apply this single function modification in `lib/nfeRevenue.ts`, and your "Desconto" details modal will fetch and display the correct underlying data.
