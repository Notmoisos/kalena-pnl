

Ran tool

Read file: pnl-matrix/lib/nfeRevenue.ts

# PRD: Add “Multa e Juros” into Financial Revenues Drill-down

## 1. Objective  
Extend the P&L so that, under **Receitas Financeiras / Financial Revenues**, a new non-expandable line **“Multa e Juros”** appears, showing the sum of `parsed_multa_juros_proportional_value` per month. This amount must:

- Be fetched alongside the existing data.
- Be added into the top‐level Financial Revenues totals (and therefore flow into Net Profit).
- Show as its own subgroup (no children).

---

## 2. High-Level Steps  

1. **BigQuery**: Add a new query to sum `parsed_multa_juros_proportional_value` by month.  
2. **Backend Integration** (`lib/pnlLogic.ts`):  
   a. Fetch the new data in `buildPnl`.  
   b. Merge its per‐month totals into the existing `totFR`.  
   c. Inject a new “Multa e Juros” entry into the financial‐revenues sup-group map (`bySup`).  
3. **Frontend**: No changes needed—in the existing drill-down code a sup with zero `cats` is rendered as a non-expandable row.  
4. **Verification**:  
   - “Multa e Juros” appears under Receitas Financeiras (▶ financial_revenue ► “Multa e Juros”).  
   - Totals and Net Profit reflect its positive contribution.

---

## 3. Detailed Implementation

### 3.1. BigQuery: `fetchRevenueAggregates` → add `fetchJurosMultaAggregates`

File: `lib/nfeRevenue.ts`

```diff
 import { BigQuery } from '@google-cloud/bigquery';
 const bq = new BigQuery({ /* … */ });

 export type RevKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto';
 export interface RevAgg { Periodo:string; kind:RevKind; valor:number; sign:'+'|'-'; }

+// ————————————————————————————————————————————————
+// New: sum of parsed_multa_juros_proportional_value by month
+export interface JurosMultaAgg {
+  Periodo: string;
+  valor: number;
+}
+export async function fetchJurosMultaAggregates(year: number): Promise<JurosMultaAgg[]> {
+  const sql = `
+    SELECT
+      FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE(data_emissao), MONTH)) AS Periodo,
+      SUM(SAFE_CAST(parsed_multa_juros_proportional_value AS FLOAT64)) AS valor
+    FROM \`${process.env.BQ_TABLE}\`
+    WHERE tipo_operacao='Saída'
+      AND finalidade='Normal/Venda'
+      AND cancelada='Não'
+      AND (nome_cenario='Venda' OR nome_cenario='Inativo')
+      AND EXTRACT(YEAR FROM data_emissao) = @year
+    GROUP BY Periodo
+  `;
+  const [rows] = await bq.query<JurosMultaAgg>({ query: sql, params: { year } });
+  return rows;
+}
 // ————————————————————————————————————————————————
```

### 3.2. Backend: Merge into `buildPnl`

File: `lib/pnlLogic.ts`

1. **Import** the new function:

```diff
 import { fetchRevenueAggregates } from '@/lib/nfeRevenue';
+import { fetchJurosMultaAggregates } from '@/lib/nfeRevenue';
```

2. **In** `export async function buildPnl(year: number) { … }`, **after**

```typescript
  // --- Financial Revenue Integration ---
  const months = Object.keys(emptyYear(year)) as Month[];
  const frRows = await getFinancialRevenueData(year);

+ // ▪️ fetch “Multa e Juros” sums
+ const jurosRows = await fetchJurosMultaAggregates(year);
  
  const totFR: Record<Month, number> = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  const bySup = new Map<string, { vals: Record<Month, number>, byCat: Map<string, Record<Month, number>> }>();

  // — existing loop: aggregate Omie data into totFR & bySup …
  for (const r of frRows) {
    const valorNum = Number(r.valor) || 0;
    totFR[r.ym] += valorNum;
    // … populate bySup for categoria_descricao_superior/categoria_descricao …
  }

+ // — integrate Multa e Juros into totals & sup-group
+ const multaVals = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
+ for (const jr of jurosRows) {
+   const ym = jr.Periodo as Month;
+   const v = Number(jr.valor) || 0;
+   multaVals[ym] = v;
+   totFR[ym] += v; 
+ }
+ // push as its own supLabel (no cats ⇒ non-expandable)
+ bySup.set('Multa e Juros', { vals: multaVals, byCat: new Map() });

  // — assemble the PnLNode
  const financialRevenueNode: PnLNode = {
    id: 'financial_revenue',
    label: 'Receitas Financeiras / Financial Revenues',
    values: totFR,
    kind: 'group',
    meta: {
      frBySup: Array.from(bySup.entries()).map(([supLabel, s]) => ({
        supLabel,
        vals: s.vals,
        cats: Array.from(s.byCat.entries()).map(([catLabel, vals]) => ({ catLabel, vals }))
      }))
    }
  };
  // …
```

### 3.3. Resulting Drill-down Behavior  
- **Top-level** “Receitas Financeiras” shows its new monthly totals (including Multa & Juros).  
- **Expand** “Receitas Financeiras”: you’ll see

  1. Não operacionais / não tributadas (▶)  
  2. Não operacionais / tributadas (▶)  
  3. **Multa e Juros** (no ▶)  

- Clicking the other two continues to drill into their categories; “Multa e Juros” is a leaf.

---

## 4. Verification Checklist

1. **Totals:**  
   - “Receitas Financeiras” numbers = Omie sums + `parsed_multa_juros_proportional_value`.  
   - Net Profit reflects the added positive contribution.
2. **Drill-down UI:**  
   - “Multa e Juros” appears as a non-expandable row under Financial Revenues.  
   - Its per-month values match the BigQuery sums.
3. **No regressions:**  
   - All existing revenue and expense drill-downs behave as before.
