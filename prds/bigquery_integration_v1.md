# ☁️ BigQuery NFe Integration – Step‑by‑Step for Next.js P&L MVP

You’ll pull **NFe rows** from a BigQuery table with a **service‑account JSON key** and merge them into the Revenue side of your P&L.

---
## 0  Prerequisites

| Item | Notes |
|------|-------|
| Service‑account JSON key | Download from GCP → IAM → Service Accounts → Keys. Give it BigQuery `roles/bigquery.dataViewer` (or `BigQuery Read Session User`) on your dataset. |
| BigQuery table | e.g. `my‑project.my_dataset.nfe_table` containing columns exactly like your mock `nfe` JSON (`data_emissao`, `tipo_operacao`, `finalidade`, …). |
| Node 18+ | You already have it. |

---
## 1  Add dependency

```bash
pnpm add @google-cloud/bigquery
```
`package.json` →
```jsonc
"dependencies": {
  /* …existing… */,
  "@google-cloud/bigquery": "^7.9.0"
}
```

---
## 2  Keep the key outside git

1. Create folder **`credentials/`** (git‑ignored).  
2. Save your key as `credentials/bq-key.json`.

Add to **`.gitignore`** if not present:
```
# credentials
credentials/
```

---
## 3  Environment variables (`.env.local`)

```env
# already have MySQL vars …
BQ_PROJECT_ID=my-project-id
BQ_KEYFILE=./credentials/bq-key.json
BQ_TABLE=my_project.my_dataset.nfe_table   # adjust
```

*(Use a relative path from project root so Vercel can include it via project env variable uploads; locally it just resolves.)*

---
## 4  New helper **`lib/bq.ts`**

```ts
// lib/bq.ts
import { BigQuery } from '@google-cloud/bigquery'

let bq: BigQuery | null = null

export function getBigQuery() {
  if (!bq) {
    bq = new BigQuery({
      projectId: process.env.BQ_PROJECT_ID,
      keyFilename: process.env.BQ_KEYFILE,
    })
  }
  return bq
}
```

---
## 5  Fetch function **`lib/nfe.ts`**

```ts
// lib/nfe.ts
import { getBigQuery } from './bq'

export type RawNfe = {
  Periodo: string   // YYYY-MM
  // the aggregates we need per P&L line
  valor_item: number
  valor_pis_cofins_iss_ir_ipi_icms: number
  valor_icmsst_fcpst: number
  valor_discount: number
}

export async function fetchNfeAggregates(year: number): Promise<RawNfe[]> {
  const sql = `
  WITH base AS (
    SELECT
      DATE_TRUNC(DATE(data_emissao), MONTH) AS period, -- 2025-01-01
      parsed_total_item_value                         AS total_item,
      parsed_discount_value                           AS discount,
      (parsed_pis_value + parsed_cofins_value + parsed_iss_value + parsed_ir_value +
       parsed_fcp_value + parsed_icm_dest_value + parsed_icm_remet_value + parsed_icms_value + parsed_ipi_value) AS impostos_receita,
      (parsed_icmsst_value + parsed_fcpst_value)      AS impostos_st
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND cancelada = 'Não'
  )
  SELECT
    FORMAT_DATE('%Y-%m', period)         AS Periodo,
    SUM(total_item)                      AS valor_item,
    SUM(impostos_receita)               AS valor_pis_cofins_iss_ir_ipi_icms,
    SUM(impostos_st)                    AS valor_icmsst_fcpst,
    SUM(discount)                        AS valor_discount
  FROM base
  GROUP BY Periodo
  ORDER BY Periodo;`

  const [rows] = await getBigQuery().query<RawNfe>({
    query: sql,
    params: { year },
  })
  return rows
}
```

> *We return ONE aggregated row per month; formulas are easier client‑side.*

---
## 6  Extend **`lib/pnlLogic.ts`**

### a) Import & new helper
```ts
import { fetchNfeAggregates } from './nfe'

async function pivotRevenue(year: number): Promise<PnLNode[]> {
  const rows = await fetchNfeAggregates(year)
  const months = Object.keys(emptyYear(year)) as Month[]

  // init rows (ids match your earlier spec)
  const gross: PnLNode = { id: '1', parentId: 'rev', label: 'Receita Bruta / Gross Revenue', values: emptyYear(year) }
  const returns: PnLNode = { id: '2', parentId: 'rev', label: 'Devoluções / Returns', sign: '-', values: emptyYear(year) }
  const taxes: PnLNode = { id: '3', parentId: 'rev', label: 'Impostos sobre receita', sign: '-', values: emptyYear(year) }
  const st:    PnLNode = { id: '4', parentId: 'rev', label: 'Impostos ST', sign: '-', values: emptyYear(year) }
  const disc:  PnLNode = { id: '5', parentId: 'rev', label: 'Descontos Financeiros', sign: '-', values: emptyYear(year) }
  const net:   PnLNode = { id: '6', parentId: 'rev', label: 'Receita Líquida / Net Revenue', values: emptyYear(year) }

  for (const r of rows) {
    const m = r.Periodo as Month
    gross.values[m] += r.valor_item
    taxes.values[m] -= r.valor_pis_cofins_iss_ir_ipi_icms
    st.values[m]    -= r.valor_icmsst_fcpst
    disc.values[m]  -= r.valor_discount
  }
  // Net = 1‑2‑3‑4‑5  (returns presently zero until you implement returns query)
  months.forEach((m) => {
    net.values[m] =
      gross.values[m] + returns.values[m] + taxes.values[m] + st.values[m] + disc.values[m]
  })

  return [gross, returns, taxes, st, disc, net]
}
```

### b) Inside **`buildPnl`** merge everything
```ts
export async function buildPnl(year: number): Promise<PnLNode[]> {
  const revenueRoot: PnLNode = { id: 'rev', label: 'Revenue', values: emptyYear(year) }
  const revLines   = await pivotRevenue(year)
  revLines.forEach((n) => {
    Object.keys(n.values).forEach((m) => {
      revenueRoot.values[m as Month] += n.values[m as Month]
    })
  })

  const expenses  = await pivotDespesas(year)
  return [revenueRoot, ...revLines, ...expenses]
}
```

---
## 7  API route stays the same
`app/api/pnl/route.ts` already calls `buildPnl(year)` → now it fetches BigQuery + MySQL concurrently.

---
## 8  Deploy notes (Vercel)

1. Upload the **service‑account JSON** to Vercel secrets or encode as one env var:  
   `BQ_KEYFILE_JSON=base64-of-json` then in `getBigQuery()` use `JSON.parse(Buffer.from(process.env.BQ_KEYFILE_JSON,'base64').toString())`.
2. Add `@google-cloud/bigquery` to the “External Files” allow‑list if using Edge Functions. (On Vercel × Node runtime you’re fine.)

---
## 9  Validation checklist
| Step | Expectation |
|------|-------------|
| `pnpm dev` | API log prints `Fetched NFe rows: X` (add a `console.log(rows.length)`). |
| UI | Revenue root > sub‑rows show positive/negative numbers; Net Revenue looks reasonable. |
| Expenses | still works (MySQL). |

🤝  Now you have **MySQL + BigQuery** driving your P&L – no mock data left!

