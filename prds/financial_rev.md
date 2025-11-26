# PRD – “Receitas Financeiras / Financial Revenues”  
(Revision 3 – **MySQL 5.6–compatible**)

This revision keeps the functional scope identical to Revision 2, but removes every BigQuery-specific feature (CTE, DATE functions that do not exist in 5.6, parameter syntax, etc.) and aligns the backend with our existing MySQL 5.6 stack.

---

## 0. Quick Facts

| Item | Value |
|------|------|
| Row label | `Receitas Financeiras / Financial Revenues` |
| Placement | Immediately **after** `2.02 + Tributarias` in the top-level P&L |
| Drilldown depth | 2 levels (Sub-group ➜ Category) |
| Sub-groups (dynamic) | `Não operacionais/ não tributadas`, `Não operacionais/ tributadas` |
| Category rows | grouped by `(codigo_categoria, categoria_descricao)` |
| Cell format | plain number (integer or 2 dec); **not** currency |
| Value sign | **Positive** (adds to LAIR / Lucro Líquido) |
| Detail modal | On click of a Category value |
| Initial fetch | piggy-backed on the *first* `/api/pnl?...` request (no extra calls for sub-groups) |
| Date nuance | `data_lancamento` arrives as `DD/MM/YYYY` – must: 1) keep full date for modal, 2) convert to `YYYY-MM` for month buckets (use the existing `Month` type logic) |

---

## 1. Backend

### 1.1 `lib/db.ts`  🆕

```ts
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host:  process.env.DB_HOST,
  user:  process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});
```

### 1.2 `lib/financialRevenue.ts`  🆕

```ts
import { pool } from './db';
import type { Month } from './pnlLogic';

export interface FinancialRevenueRow {
  dev_id: string;
  categoria_superior: string;           // '1.01' | '1.02'
  categoria_descricao_superior: string; // ex: 'Não operacionais/ não tributadas'
  codigo_categoria: string;
  categoria_descricao: string;          // ex: 'Entrada não tributada'
  data_lancamento_raw: string;          // '14/05/2025'
  valor: number;                        // DECIMAL
  observacao: string | null;
  ym: Month;                            // derived in JS: '2025-05'
}

export async function getFinancialRevenueData(
  year: number,
  nomeProjeto: string
): Promise<FinancialRevenueRow[]> {

  /*  ── MySQL 5.6 note ───────────────────────────────────────────────
      • no CTE / WITH
      • still allowed to use JSON_EXTRACT (we used it earlier in this DB)
      • STR_TO_DATE + DATE_FORMAT used for date conversion
     ----------------------------------------------------------------- */
  const sql = `
      SELECT
          l.dev_id,
          cat.categoria_superior,
        cat2.descricao  AS categoria_descricao_superior,
        cat.codigo      AS codigo_categoria,
        cat.descricao   AS categoria_descricao,
        JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.dDtLanc'))   AS data_lancamento_raw,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.nValorLanc')) AS DECIMAL(15,2)) AS valor,
        JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cObs'))       AS observacao
    FROM  omie_contas_correntes_lancamentos_api l
    JOIN  omie_categorias_api cat
          ON JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cCodCateg')) = cat.codigo
         AND l.nome_projeto = cat.nome_projeto
    JOIN  omie_categorias_api cat2
          ON cat.categoria_superior = cat2.codigo
         AND l.nome_projeto = cat2.nome_projeto
    WHERE cat.categoria_superior IN ('1.01','1.02')
      AND l.nome_projeto = ?
      /* keep year filter lightweight: compare YEAR() after converting */
      AND YEAR(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho,'$.dDtLanc')), '%d/%m/%Y')) = ?
  `;

  const [rows] = await pool.execute<any[]>(sql, [nomeProjeto, year]);

  /* derive ym = 'YYYY-MM' in JS (avoids DATE_FORMAT in query) */
  return rows.map(r => {
    const ym = ((): Month => {
      const [d, m, y] = r.data_lancamento_raw.split('/');
      return `${y}-${m}` as Month;      // '2025-05'
    })();
    return { ...r, ym };
  }) as FinancialRevenueRow[];
}
```

Why JS derivation?  
MySQL 5.6 can do it (`DATE_FORMAT(...) AS ym`), but computing once in JS avoids repeating the heavy `STR_TO_DATE` call in every sub-select we'll add later.

### 1.3 `pages/api/financial-revenue-details.ts`  🆕

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '@/lib/db';
import type { FinancialRevenueRow } from '@/lib/financialRevenue';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FinancialRevenueRow[] | { error: string }>
) {
  if (req.method !== 'GET') return res.status(405).end();

  const { year, catSup, catDesc, projeto } = req.query;
  if (!year || !catSup || !catDesc || !projeto)
    return res.status(400).json({ error: 'Missing params' });

  const sql = `
    SELECT
        l.dev_id,
        cat.categoria_superior,
        cat2.descricao  AS categoria_descricao_superior,
        cat.codigo      AS codigo_categoria,
        cat.descricao   AS categoria_descricao,
        JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.dDtLanc')) AS data_lancamento_raw,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.nValorLanc')) AS DECIMAL(15,2)) AS valor,
        JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cObs'))      AS observacao
    FROM  omie_contas_correntes_lancamentos_api l
    JOIN  omie_categorias_api cat
          ON JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cCodCateg')) = cat.codigo
         AND l.nome_projeto = cat.nome_projeto
    JOIN  omie_categorias_api cat2
          ON cat.categoria_superior = cat2.codigo
         AND l.nome_projeto = cat2.nome_projeto
    WHERE cat.categoria_superior IN ('1.01','1.02')
      AND l.nome_projeto = ?
      AND cat2.descricao = ?
      AND cat.descricao  = ?
      AND YEAR(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho,'$.dDtLanc')), '%d/%m/%Y')) = ?
  `;

  const [rows] = await pool.execute<any[]>(sql, [
    projeto,
    catSup,
    catDesc,
    year,
  ]);

  const mapped = rows.map(r => {
    const [d, m, y] = r.data_lancamento_raw.split('/');
    return { ...r, ym: `${y}-${m}` };
  }) as FinancialRevenueRow[];

  res.status(200).json(mapped);
}
```

---

### 1.4 `lib/pnlLogic.ts`  – Inject node & totals

1. **Const**  

```ts
const ID_FR = 'financial_revenue';          // new top-level node
```

2. **Insert into order**  
Find the `pnlOrder` array – insert `ID_FR` **after** the ID of `2.02 + Tributarias`.

3. **Fetch & aggregate**

```ts
// near other fetches
const frRows = await getFinancialRevenueData(year, nome_projeto);

const months = buildMonths(year);                 // already exists
const totFR   = initMonthDict(0);                 // util that returns Record<Month,0>

const bySup   = new Map<string, { vals:MonthDict, byCat: Map<string,MonthDict> }>();

for (const r of frRows) {
  totFR[r.ym] += r.valor;

  const sup = ensure(bySup, r.categoria_descricao_superior,
    () => ({ vals:initMonthDict(0), byCat:new Map() })
  );
  sup.vals[r.ym] += r.valor;

  const cat = ensure(sup.byCat, r.categoria_descricao,
    () => initMonthDict(0)
  );
  cat[r.ym] += r.valor;
}
```

4. **Push nodes**  

```ts
pnl.push({
  id: ID_FR,
  label: 'Receitas Financeiras / Financial Revenues',
  values: totFR,
  kind: 'group',
  meta: { frBySup: Array.from(bySup.entries()).map(([supLabel,s]) => ({
    supLabel,
    vals: s.vals,
    cats: Array.from(s.byCat.entries()).map(([catLabel,vals]) => ({ catLabel, vals }))
  })) }
});
```

5. **Impact LAIR / Lucro Líquido**  
Where you presently aggregate positives (e.g., `lair.values[m] += …`), add `totFR[m]`.

---

## 2. Frontend

### 2.1 `components/PnLTable.tsx`

#### 2.1.1 Add helpers

```ts
const ID_FR = 'financial_revenue';
type FRSub  = { supLabel:string, vals:Record<Month,number>, cats:{catLabel:string,vals:Record<Month,number>}[] };
```

#### 2.1.2 `getSubRows`

```ts
// ↑ existing code …

// A. first level
if (n.id === ID_FR) {
  const groups = n.meta?.frBySup as FRSub[] | undefined;
  return (groups ?? []).map(g => ({
    id: `${ID_FR}_${sanitizeId(g.supLabel)}`,
    parentId: ID_FR,
    label: g.supLabel,
    values: g.vals,
    kind: 'intermediate',
    meta: { cats: g.cats }
  }));
}

// B. second level
if (n.parentId === ID_FR && n.meta?.cats) {
  const cats = n.meta.cats as FRSub[0]['cats'];
  return cats.map(c => ({
    id: `${n.id}_cat_${sanitizeId(c.catLabel)}`,
    parentId: n.id,
    label: c.catLabel,
    values: c.vals,
    kind: 'family',
    meta: { sup: n.label, cat: c.catLabel }   // for modal
  }));
}
```

#### 2.1.3 Month-cell renderer – numeric & clickable

```diff
const isFRLeaf = row.original.parentId?.startsWith(`${ID_FR}_`) && row.original.kind === 'family';

if (isFRLeaf) {
  const num = row.original.values[m] || 0;
  const txt = Number.isInteger(num) ? `${num}` : num.toFixed(2);
  return (
    <button
      className="text-right w-full hover:underline font-bold"
      onClick={() => {
        onCellClick({
          ym: m,
          rowId: row.original.id,
          kind: 'fr_detail',
          sup: row.original.meta.sup,
          cat: row.original.meta.cat
        });
      }}
    >{txt}</button>
  );
}
```

*Leave all existing volume / percentage / currency branches intact.*

#### 2.1.4 `getRowCanExpand`

```diff
return (
  ['1','1_volumes', … , '10', ID_FR].includes(r.original.id)
  || r.original.id.startsWith(`${ID_FR}_`)        // sub-groups
  … existing conditions …
)
```

---

### 2.2 Parent page (`app/page.tsx` or equivalent)

```ts
const handlePnLClick = async (ctx /* same shape plus sup & cat */) => {
  if (ctx.kind === 'fr_detail') {
    const { ym, sup, cat } = ctx;
    const res = await fetch(`/api/financial-revenue-details?year=${ym.slice(0,4)}&catSup=${encodeURIComponent(sup)}&catDesc=${encodeURIComponent(cat)}`);
    const details = await res.json();
    openModal({ title:`${sup} / ${cat} – ${ym}`, rows:details }); // your modal util
    return;
  }
  // existing handlers …
};
```

---

## 3. Initial Fetch – one shot

`pages/api/pnl.ts` (or wherever the main P&L API lives) should already call `buildPnL(year, nome_projeto)`.  
Because `buildPnL` now embeds Financial Revenue, *no* extra HTTP request is required for the table.

---

## 4. Testing Checklist

1. Load the dashboard → FR row appears under `2.02 + Tributarias`; values equal SQL total.  
2. Expand ➜ two sub-groups, each value = sum of its categories.  
3. Expand a sub-group ➜ category list, values numeric (no "R$").  
4. Click a category cell ➜ modal lists individual transactions (`data_lancamento_raw`, `observacao`, `valor`); sum matches clicked value.  
5. LAIR & Lucro Líquido increase by the FR totals.  
6. Regression: volume drilldowns, existing modals, %-of-gross logic remain unaffected.

---

## 5. Roll-out Notes

* Add `financialRevenue.ts` & detail API in the same PR.  
* Migrate BigQuery IAM if the new query hits additional tables / views.  
* Run unit tests for `buildPnL` ensuring FR integration.  
* Staging DB must have at least a few FR rows to demo the feature.

* Added MySQL bits:

1. **DB credentials** – ensure `.env.local` (or parameter store) contains `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`.
2. **Indexing** – add composite index on  
   `(nome_projeto, categoria_superior, categoria_descricao_superior(50), categoria_descricao(50))`  
   to keep the new queries snappy.
3. **Migration scripts** – none; we're only reading.
4. **Security** – the new API requires `?projeto=`; enforce auth if needed.

---

### Diff-at-a-glance vs. Rev 2

| Area | Rev 2 (BigQuery) | Rev 3 (MySQL 5.6) |
|------|------------------|-------------------|
| Connection | `bigqueryClient` | `mysql2/promise` pool |
| CTE | `WITH src AS (…)` | inline query (no CTE) |
| Date bucket | `FORMAT_DATE` in SQL | derive `ym` in JS |
| View suggestion | `financial_revenue_flat_view` | **optional**; same query used directly |
| Parameter syntax | `@param` | `?` positional array |

Everything else—node IDs, aggregation logic, React expansion, modal triggering—remains the same.

---

> **Verdict:** after these SQL & connection tweaks, the PRD is fully aligned with your MySQL 5.6 environment while preserving every functional requirement from Revision 2.
