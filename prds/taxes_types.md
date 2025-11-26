# 🛠 FULL IMPLEMENTATION GUIDE — Per‑Tax Breakdown (Revenue Taxes & ST‑Taxes)

**This version supersedes all earlier drafts and includes:**

- *IPI* added to “Impostos sobre receita”.
- *Step‑by‑step Impostos ST* extraction, pivot, and wiring.
- Copy‑ready SQL + TypeScript snippets.

Follow the sections in order and paste verbatim.

---

## 0  Files you will edit

| File                      | Change                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `lib/nfe.ts`              | **Replace entire file** (adds both `fetchRevenueTaxRows` & `fetchStTaxRows`).       |
| `lib/pnlLogic.ts`         | Add `pivotRevenueTaxes()`, `pivotStTaxes()`, update `pivotRevenue()`, `buildPnl()`. |
| `components/PnLTable.tsx` | Expand default map.                                                                 |

---

## 1  `lib/nfe.ts` — *replace entire file*

```ts
// lib/nfe.ts   🔄 FULL FILE REPLACEMENT
import { getBigQuery } from './bq'

// ────────── Shared Types ──────────
export type RawTax = {
  Periodo: string                                 // YYYY‑MM
  tax_name: string                                // 'PIS', 'Cofins', …
  scenario: 'Venda' | 'Bonificacao' | 'Devolucao'
  valor: number                                   // already signed (− for devolucao)
}

// ────────── 1.  Revenue‑related taxes  (#3) ──────────
export async function fetchRevenueTaxRows(year: number): Promise<RawTax[]> {
  const sql = `
  WITH union_all AS (
    -- Venda
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period, 'Venda' AS scenario,
      SAFE_CAST(parsed_pis_value           AS FLOAT64) AS pis,
      SAFE_CAST(parsed_cofins_value        AS FLOAT64) AS cofins,
      SAFE_CAST(parsed_iss_value           AS FLOAT64) AS iss,
      SAFE_CAST(parsed_ir_value            AS FLOAT64) AS ir,
      SAFE_CAST(parsed_ipi_value           AS FLOAT64) AS ipi,
      SAFE_CAST(parsed_fcp_value           AS FLOAT64) AS fcp,
      SAFE_CAST(parsed_icm_dest_value      AS FLOAT64) AS icms_dest,
      SAFE_CAST(parsed_icm_remet_value     AS FLOAT64) AS icms_remet,
      SAFE_CAST(parsed_icms_value          AS FLOAT64) AS icms
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')

    UNION ALL
    -- Bonificação
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Bonificacao',
      SAFE_CAST(parsed_pis_value AS FLOAT64),
      SAFE_CAST(parsed_cofins_value AS FLOAT64),
      SAFE_CAST(parsed_iss_value AS FLOAT64),
      SAFE_CAST(parsed_ir_value AS FLOAT64),
      SAFE_CAST(parsed_ipi_value AS FLOAT64),
      SAFE_CAST(parsed_fcp_value AS FLOAT64),
      SAFE_CAST(parsed_icm_dest_value AS FLOAT64),
      SAFE_CAST(parsed_icm_remet_value AS FLOAT64),
      SAFE_CAST(parsed_icms_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND nome_cenario='Bonificação'

    UNION ALL
    -- Devolução  (sign flip)
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Devolucao',
      -SAFE_CAST(parsed_pis_value AS FLOAT64),
      -SAFE_CAST(parsed_cofins_value AS FLOAT64),
      -SAFE_CAST(parsed_iss_value AS FLOAT64),
      -SAFE_CAST(parsed_ir_value AS FLOAT64),
      -SAFE_CAST(parsed_ipi_value AS FLOAT64),
      -SAFE_CAST(parsed_fcp_value AS FLOAT64),
      -SAFE_CAST(parsed_icm_dest_value AS FLOAT64),
      -SAFE_CAST(parsed_icm_remet_value AS FLOAT64),
      -SAFE_CAST(parsed_icms_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND finalidade='Devolução'
      AND cancelada='Não'
  )

  SELECT FORMAT_DATE('%Y-%m', period) AS Periodo, tax_name, scenario, SUM(tax_val) AS valor
  FROM union_all,
    UNNEST([
      STRUCT('PIS'    AS tax_name, pis                              AS tax_val),
      STRUCT('Cofins' AS tax_name, cofins                           AS tax_val),
      STRUCT('ISS'    AS tax_name, iss                              AS tax_val),
      STRUCT('IR'     AS tax_name, ir                               AS tax_val),
      STRUCT('IPI'    AS tax_name, ipi                              AS tax_val),
      STRUCT('FCP'    AS tax_name, fcp                              AS tax_val),
      STRUCT('ICMS'   AS tax_name, icms_dest + icms_remet + icms    AS tax_val)
    ])
  GROUP BY Periodo, tax_name, scenario
  ORDER BY Periodo;`

  const [rows] = await getBigQuery().query<RawTax>({ query: sql, params: { year } })
  return rows
}

// ────────── 2.  ST‑related taxes  (#4) ──────────
export async function fetchStTaxRows(year: number): Promise<RawTax[]> {
  const sql = `
  WITH union_all AS (
    -- Venda & Inativo
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Venda' AS scenario,
      SAFE_CAST(parsed_icmsst_value AS FLOAT64) AS icms_st,
      SAFE_CAST(parsed_fcpst_value  AS FLOAT64) AS fcp_st
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')

    UNION ALL
    -- Bonificação
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Bonificacao',
      SAFE_CAST(parsed_icmsst_value AS FLOAT64),
      SAFE_CAST(parsed_fcpst_value  AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND nome_cenario='Bonificação'

    UNION ALL
    -- Devolução (sign flip)
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Devolucao',
      -SAFE_CAST(parsed_icmsst_value AS FLOAT64),
      -SAFE_CAST(parsed_fcpst_value  AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND finalidade='Devolução'
      AND cancelada='Não'
  )

  SELECT FORMAT_DATE('%Y-%m', period) AS Periodo, tax_name, scenario, SUM(tax_val) AS valor
  FROM union_all,
    UNNEST([
      STRUCT('ICMS_ST' AS tax_name, icms_st AS tax_val),
      STRUCT('FCP_ST'  AS tax_name, fcp_st  AS tax_val)
    ])
  GROUP BY Periodo, tax_name, scenario
  ORDER BY Periodo;`

  const [rows] = await getBigQuery().query<RawTax>({ query: sql, params: { year } })
  return rows
}
```

---

## 2  `lib/pnlLogic.ts` — add pivots & wire

### 2.1  New imports

```ts
import { fetchRevenueTaxRows, fetchStTaxRows, RawTax } from './nfe'
```

### 2.2  Generic helper (place once)

```ts
function buildTaxTree(raw: RawTax[], rootId: 'tax3' | 'tax4', rootLabel: string): PnLNode[] {
  const rootYear = parseInt(raw[0]?.Periodo.slice(0, 4) ?? '2025')
  const months = Object.keys(emptyYear(rootYear)) as Month[]
  const root: PnLNode = { id: rootId, label: rootLabel, sign: '-', values: emptyYear(rootYear) }
  const map: Record<string, PnLNode> = {}

  for (const r of raw) {
    const m = r.Periodo as Month
    const childId = `${rootId}_${r.tax_name}_${r.scenario}`

    if (!map[childId]) {
      map[childId] = {
        id: childId,
        parentId: rootId,
        label: `${r.tax_name} ${r.scenario === 'Venda' ? '' : r.scenario}`.trim(),
        sign: r.valor < 0 ? '-' : '+',
        values: emptyYear(rootYear)
      }
    }
    map[childId].values[m] += r.valor
    root.values[m] += r.valor
  }

  return [root, ...Object.values(map)]
}
```

### 2.3  pivot helpers

```ts
export async function pivotRevenueTaxes(year: number) {
  return buildTaxTree(await fetchRevenueTaxRows(year), 'tax3', 'Impostos sobre receita')
}

export async function pivotStTaxes(year: number) {
  return buildTaxTree(await fetchStTaxRows(year), 'tax4', 'Impostos ST')
}
```

### 2.4  Modify **pivotRevenue** to inject the new tax trees

```ts
async function pivotRevenue(year: number): Promise<PnLNode[]> {
  const months = Object.keys(emptyYear(year)) as Month[]

  const gross   = /* existing calculation */
  const returns = /* existing */
  const discount= /* existing */

  // 🆕 fetch per‑tax trees
  const revenueTaxNodes = await pivotRevenueTaxes(year)   // tax3 root + children
  const stTaxNodes      = await pivotStTaxes(year)        // tax4 root + children

  const taxRoot = revenueTaxNodes.find((n) => n.id === 'tax3')!

  const net: PnLNode = {
    id: '6', parentId: 'rev', label: 'Receita Líquida / Net Revenue', values: emptyYear(year)
  }
  months.forEach((m) => {
    net.values[m] = gross.values[m] + returns.values[m] + taxRoot.values[m] + discount.values[m]
  })

  return [
    gross,
    returns,
    ...revenueTaxNodes,
    ...stTaxNodes,
    discount,
    net,
  ]
}
```

### 2.5  Ensure **buildPnl** merges roots + expenses

```ts
export async function buildPnl(year: number): Promise<PnLNode[]> {
  const revenueLines = await pivotRevenue(year)

  const revenueRoot: PnLNode = { id: 'rev', label: 'Revenue', values: emptyYear(year) }
  Object.keys(revenueRoot.values).forEach((m) => {
    revenueLines.forEach((row) => {
      if (row.parentId === 'rev') revenueRoot.values[m as Month] += row.values[m as Month]
    })
  })

  const expenseLines = await pivotDespesas(year)
  return [revenueRoot, ...revenueLines, ...expenseLines]
}
```

---

## 3  `components/PnLTable.tsx` — update default expanded map

```tsx
const [expanded, setExpanded] = useState<Record<string, boolean>>({
  rev: true,
  tax3: false,   // revenue taxes collapsed by default
  tax4: false,   // ST taxes collapsed
  other: true,
})
```

---

**Now restart the dev server** → both tax parents show expandable per‑tax/per‑scenario rows, with Devolução values negative and totals correct.

