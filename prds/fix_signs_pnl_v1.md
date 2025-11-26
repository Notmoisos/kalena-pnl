# PRD ▸ Phase 1 – Display All Values Positive (Returns/Discounts/CPV Devoluções/Despesas)

**Objective** Devoluções (id 2), Descontos Financeiros (id 5), CPV Devoluções (id 10), and every Despesa row must show positive numbers in the table even though they subtract from totals.  We achieve this by **removing the “‑” multiplier in SQL** and letting the `sign` flag drive the arithmetic in the totals.

| File | Exact change |
|------|--------------|
| **`lib/nfeRevenue.ts`** | Delete one character (the leading minus) in two UNION blocks + add `sign` column. |
| **`lib/nfeCosts.ts`** | Delete the leading minus in CPV_Devol query + add `sign` column. |
| **`lib/pnlLogic.ts`** | Already sign‑aware → **no change**. |
| **UI files** | No change (cells just show the stored value). |

> Despesa rows already come from MySQL as positive values, so no action needed there.

---
## 1  `lib/nfeRevenue.ts` patch
### 1.1  Remove the minus signs
```diff
-    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) , 'Devolucao',
-           -SAFE_CAST(parsed_total_product_value AS FLOAT64)
+    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) , 'Devolucao',
+           SAFE_CAST(parsed_total_product_value AS FLOAT64)
@@
-    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) , 'Desconto',
-           -SAFE_CAST(parsed_discount_value AS FLOAT64)
+    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) , 'Desconto',
+           SAFE_CAST(parsed_discount_value AS FLOAT64)
```

### 1.2  Return a `sign` column (if not present)
Immediately below the `SELECT` list in the **final** query:
```sql
SELECT FORMAT_DATE('%Y-%m', period) AS Periodo,
       kind,
       SUM(amount) AS valor,
       CASE kind WHEN 'Devolucao' THEN '-' WHEN 'Desconto' THEN '-' ELSE '+' END AS sign
FROM base …
```
Update TypeScript type:
```diff
-export interface RevAgg { Periodo:string; kind:RevKind; valor:number; }
+export interface RevAgg { Periodo:string; kind:RevKind; valor:number; sign:'+'|'-'; }
```
*(No other code in this file needs to change.)*

---
## 2  `lib/nfeCosts.ts` patch
### 2.1  Remove minus from CPV_Devol
```diff
-    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'CPV_Devol',
-           -SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
+    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'CPV_Devol',
+           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
```

### 2.2  Add `sign` column & interface
```sql
SELECT FORMAT_DATE('%Y-%m',p) AS Periodo,
       k  AS kind,
       SUM(amt) AS valor,
       CASE k WHEN 'CPV_Devol' THEN '-' ELSE '+' END AS sign
FROM base …```
```diff
-export interface CogsAgg { Periodo:string; kind:CogsKind; valor:number; }
+export interface CogsAgg { Periodo:string; kind:CogsKind; valor:number; sign:'+'|'-'; }
```

### 2.3  Drill‑down query: delete sign multiplier
```diff
- ${sign}SUM(parsed_unit_cost*parsed_quantity_units) AS valor_total
+ SUM(parsed_unit_cost*parsed_quantity_units)        AS valor_total
```
Remove the line that defines `const sign = …`.

---
## 3  `lib/pnlLogic.ts` – **no change needed**
All totals already use:
```ts
total += node.sign==='-' ? -node.values[m] : node.values[m];
```
so the subtraction remains correct.

---
## 4  Validation steps
1. Run `pnpm dev`, open `/pnl?year=2025`.
2. Verify cells in **Devoluções**, **Descontos Financeiros**, **CPV Devoluções**, and every expense row now show *positive* values.
3. Net Revenue & Operating Income are **unchanged** vs spreadsheet.
4. Drill‑down pop‑ups list positive product totals; their sums equal the table cell values.

After these patches you have a fully positive table while keeping all mathematics intact.

