# PRD: Two-level Volume Drilldown for Gross Revenue and Returns

## Objective
Add two lines under the top-level rows "Receita Bruta / Gross Revenue" and "Devoluções / Returns" to display volume breakdowns. The lines should be:

- "Volumes (Receita)"
- "Volumes (Devolucoes)"

They must appear immediately below their respective parent rows, show no numeric values, have no special background styling, and support two‐level drilldown (Familia → Product) via a new `/api/volume-details` route.

---

## 1. Backend Changes

### 1.1 Create `lib/nfeVolume.ts`

```typescript
import { BigQuery } from '@google-cloud/bigquery'
import { FamilyApiRow } from './nfeFamily'
import { ProductApiRow } from './nfeProduct'

const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.BQ_KEYFILE,
})

type VolumeKind = 'ReceitaBruta' | 'Devolucao'

export async function fetchVolumeFamilyDetails(
  year: string,
  kind: VolumeKind
): Promise<FamilyApiRow[]> {
  let filter = ''
  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'\n                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      break
    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      break
  }
  const sql = `
    SELECT
      FORMAT('%s (%s)', descricao_familia,
        CASE WHEN parsed_type_unit IN ('CAIXA','CX') THEN 'CX' ELSE parsed_type_unit END
      ) AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(parsed_quantity_units) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
    LIMIT 500
  `
  const [rows] = await bq.query({ query: sql, params: { year } })
  return rows as FamilyApiRow[]
}

export async function fetchVolumeProductDetails(
  year: string,
  kind: VolumeKind
): Promise<ProductApiRow[]> {
  let filter = ''
  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'\n                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      break
    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      break
  }
  const sql = `
    SELECT
      FORMAT('%s (%s)', parsed_x_prod_value,
        CASE WHEN parsed_type_unit IN ('CAIXA','CX') THEN 'CX' ELSE parsed_type_unit END
      ) AS produto,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(parsed_quantity_units) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY produto, ym
    ORDER BY ym, valor DESC
    LIMIT 500
  `
  const [rows] = await bq.query({ query: sql, params: { year } })
  return rows as ProductApiRow[]
}
```

### 1.2 Create API route `app/api/volume-details/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { fetchVolumeFamilyDetails, fetchVolumeProductDetails } from '@/lib/nfeVolume'

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const year = p.get('year') ?? ''
  const kind = p.get('kind') as 'ReceitaBruta' | 'Devolucao'
  const breakdown = p.get('breakdown')

  if (!['ReceitaBruta','Devolucao'].includes(kind))
    return NextResponse.json({ error: 'unsupported kind' }, { status: 400 })

  if (breakdown === 'family') {
    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
    const rows = await fetchVolumeFamilyDetails(year, kind)
    return NextResponse.json(rows)
  }

  if (breakdown === 'product') {
    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
    const rows = await fetchVolumeProductDetails(year, kind)
    return NextResponse.json(rows)
  }

  return NextResponse.json({ error: 'bad params' }, { status: 400 })
}
```

### 1.3 Update P&L generator in `lib/pnlLogic.ts`

```diff
// ... existing code above buildPnl ...
 export async function buildPnl(year: number): Promise<PnLNode[]> {
-  const revenueLines = await pivotRevenueLines(year)
+  const rawRevenue = await pivotRevenueLines(year)
+  // insert volume nodes immediately after Gross Revenue and Returns
+  const empty = emptyYear(year)
+  const volRev: PnLNode = { id: '1_volumes', label: 'Volumes (Receita)', values: empty }
+  const volRet: PnLNode = { id: '2_volumes', label: 'Volumes (Devolucoes)', values: empty }
+  const revenueLines = rawRevenue.flatMap(n => {
+    if (n.id === '1') return [n, volRev]
+    if (n.id === '2') return [n, volRet]
+    return [n]
+  })
   const cogsLines = await pivotCogsLines(year)
   const expenseLines = await pivotDespesas(year)

   const months = Object.keys(emptyYear(year)) as Month[]
-  const nodes: Record<string, PnLNode> = {}
-  [...revenueLines, ...cogsLines].forEach(n => { nodes[n.id] = n })
+  const nodes: Record<string, PnLNode> = {}
+  [...revenueLines, ...cogsLines].forEach(n => { nodes[n.id] = n })
   const groups: Record<string, PnLNode> = {}
   expenseLines.forEach(n => { if (n.id.startsWith('grp_')) groups[n.id] = n })

   // ... existing intermediate & percentage row builds ...

   const finalPnlRows: (PnLNode | undefined)[] = [
-    nodes['1'],
-    nodes['2'],
+    nodes['1'],
+    nodes['1_volumes'],
+    nodes['2'],
+    nodes['2_volumes'],

     taxRootNode,
```

---

## 2. Frontend Changes (`components/PnLTable.tsx`)
All edits are within the main component.

### 2.1 Enable expand on volume parents

```diff
 const table = useReactTable({
   // ...
   getRowCanExpand: (r) =>
-    ['1','2','5','7','8','9','10'].includes(r.original.id)
+    ['1','1_volumes','2','2_volumes','5','7','8','9','10'].includes(r.original.id)
     || r.original.id.endsWith('_breakdown_familia')
     || r.original.id.endsWith('_breakdown_produto')
     || (childMap[r.original.id]?.length ?? 0) > 0,
```

### 2.2 Provide breakdown for volume parents

```diff
 const getSubRows = (n: Node) => {
   const cacheKey = `${n.id}_${year}`

+  // Volume parent → show Familia & Produto breakdown
+  if (['1_volumes','2_volumes'].includes(n.id)) {
+    return [
+      { id: `${n.id}_breakdown_familia`, parentId: n.id, label: 'Familia', kind: 'breakdown', values: {} as Record<Month,number> },
+      { id: `${n.id}_breakdown_produto`, parentId: n.id, label: 'Produto',   kind: 'breakdown', values: {} as Record<Month,number> }
+    ]
+  }

   // ... existing branches for top-level, familia, produto, etc. ...
```

### 2.3 Adapt expander column click

Inside the expander cell's `onClick` block, **before** the existing family/product cases (for revenue/COGS), insert:

```diff
             // 1) Top‐level: no fetch for volume parents
-            if (['1','2','5','7','8','9','10'].includes(id)) return;
+            if (['1','1_volumes','2','2_volumes','5','7','8','9','10'].includes(id)) return;
+            // Volume Familia breakdown (when clicking the expander of the "Familia" intermediate row)
+            if (id.endsWith('_breakdown_familia') && id.includes('_volumes') && !familyData[cacheKey] && !loadingMap[cacheKey]) {
+              const parent = id.replace('_breakdown_familia','') // e.g., "1_volumes"
+              const kind   = parent.startsWith('1_') ? 'ReceitaBruta' : 'Devolucao'
+              setLoadingMap(p => ({ ...p, [cacheKey]: true }))
+              try {
+                const rows = await fetch(`/api/volume-details?year=${year}&kind=${kind}&breakdown=family`).then(r=>r.json()) as FamilyApiRow[]
+                setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }))
+                setDataVersion(v => v + 1)
+              } finally { setLoadingMap(p => ({ ...p, [cacheKey]: false })) }
+              return
+            }
+            // Volume Produto breakdown (when clicking the expander of the "Produto" intermediate row)
+            if (id.endsWith('_breakdown_produto') && id.includes('_volumes') && !productData[cacheKey] && !loadingProdMap[cacheKey]) {
+              const parent = id.replace('_breakdown_produto','') // e.g., "1_volumes"
+              const kind   = parent.startsWith('1_') ? 'ReceitaBruta' : 'Devolucao'
+              setLoadingProdMap(p => ({ ...p, [cacheKey]: true }))
+              try {
+                const rows = await fetch(`/api/volume-details?year=${year}&kind=${kind}&breakdown=product`).then(r=>r.json()) as ProductApiRow[]
+                setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }))
+                setDataVersion(v => v + 1)
+              } finally { setLoadingProdMap(p => ({ ...p, [cacheKey]: false })) }
+              return
+            }
```

### 2.4 Hide zeros for volume parent

At the top of the month‐cell renderer (the `cell: ({ row }: { row: any }) => { ... }` function within the `monthCols.map(...)` definition), return an empty span for volume parents:

```diff
 cell: ({ row }: { row: any }) => { // This is the function for each month column
+  if (row.original.id === '1_volumes' || row.original.id === '2_volumes') {
+    return <span />
+  }
   const kind = row.original.kind;
   // … existing cell logic …
```

### 2.5 Styling Consideration for Main Volume Lines

The requirement is for "Volumes (Receita)" and "Volumes (Devolucoes)" lines to have "no special background color".

Currently, in `PnLTable.tsx`, row styling includes:
`!row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]'`

Since the new volume parent nodes (`1_volumes`, `2_volumes`) are created in `lib/pnlLogic.ts` without a specific `kind`, and they will have `depth > 0` (being children of the root or another high-level node if the P&L structure changes), they might inherit the `bg-[#e3e6f1]` style.

To ensure they have a default/transparent background:

**Option A (Recommended): Assign a specific, unstyled kind or className in `lib/pnlLogic.ts`:**

```diff
// In lib/pnlLogic.ts, when creating volRev and volRet:
+  const volRev: PnLNode = { id: '1_volumes', label: 'Volumes (Receita)', values: empty, kind: 'volume_parent' } // or className: 'volume-parent-row'
+  const volRet: PnLNode = { id: '2_volumes', label: 'Volumes (Devolucoes)', values: empty, kind: 'volume_parent' } // or className: 'volume-parent-row'
```
Then, ensure that `'volume_parent'` kind (or `'.volume-parent-row'` class) does not have any specific background rules applied in `PnLTable.tsx`'s `clsx` for row styling. This gives explicit control.

**Option B: Modify `clsx` logic in `PnLTable.tsx`:**
Explicitly exclude these IDs from the generic styling:

```diff
// In PnLTable.tsx, tbody > tr > className={clsx(...)}
// ...
!row.original.kind && row.depth > 0 && !['1_volumes', '2_volumes'].includes(row.original.id) && 'bg-[#e3e6f1]'
// ...
```
Option A is generally cleaner for managing distinct row types.

---

## 3. Manual Verification

1.  Run `/api/pnl?year=2025` (or any relevant year) and ensure the JSON tree returned by the API includes nodes `1_volumes` and `2_volumes` directly following `1` and `2` respectively.
2.  In the UI, verify that "Volumes (Receita)" and "Volumes (Devolucoes)" appear directly under "Receita Bruta / Gross Revenue" and "Devoluções / Returns" respectively. These "Volumes..." lines should display no numeric values in the month columns.
3.  Verify that the "Volumes (Receita)" and "Volumes (Devolucoes)" rows themselves do not have a special background color (e.g., they should not be light blue like other drillable rows unless intended). Adjust styling per Section 2.5 if necessary.
4.  Expand a volume parent row (e.g., "Volumes (Receita)"). This should reveal two intermediate sub-rows: "Familia" and "Produto". These intermediate rows will likely have a `bg-[#e3e6f1]` style due to `kind: 'breakdown'`.
5.  Expand the "Familia" intermediate sub-row (under "Volumes (Receita)"). This action should trigger a data fetch to `/api/volume-details?breakdown=family...`, and then display the actual family volume rows (e.g., "Product Family A (CX)") beneath it. These family rows should be styled (e.g., `bg-emerald-100` if they adopt the standard family styling).
6.  Similarly, expand the "Produto" intermediate sub-row (under "Volumes (Receita)"). This should trigger a data fetch to `/api/volume-details?breakdown=product...` and display the actual product volume rows (e.g., "Specific Product X (UN)") beneath it. These product rows should also be styled.
7.  Repeat steps 4-6 for "Volumes (Devolucoes)".
8.  Confirm that clicking the expander on an already expanded "Familia" or "Produto" intermediate row collapses it without re-fetching data (unless cache is intentionally busted).
9.  Cross‐check that the aggregated volume numbers displayed for families/products (if they were to be summed, though individual lines are shown) conceptually align with expectations from BigQuery for the given `parsed_quantity_units`. (Actual summation isn't part of these rows, they show unit-specific volumes). 