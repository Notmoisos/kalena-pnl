

Ran tool


Read file: pnl-matrix/app/api/nfe-details/route.ts

```markdown
# PRD: Two‐Level “Familia” / “Produto” Drilldown under Gross & COGS

## 🧐 Context & Goal

Currently, clicking on any of these **top‐level** rows:

- **Receita Bruta** (`id='1'`)  
- **Devoluções** (`id='2'`)  
- **Descontos** (`id='5'`)  
- **CPV** (`id='7'`)  
- **CPV Bonificações e Amostras** (`id='8'`)  
- **Perdas e Descartes** (`id='9'`)  
- **CPV Devoluções** (`id='10'`)  

immediately expands into *family* rows (for COGS) or into a single–level family breakdown (for revenue).  
We want instead a **two‐level** drilldown for **all** of these:

1. **First click** → show exactly **two** child rows under the clicked top‐level node:  
   - **“Familia”** (kind=`intermediate`)  
   - **“Produto”** (kind=`intermediate`)  

2. **Click “Familia”** → fetch and pivot *family* data (via `/api/...-details?breakdown=family`), interleaving each family row (green, `kind='family'`) with a **% of Gross** row (italic, green).

3. **Click “Produto”** → fetch and pivot *product* data (via `/api/...-details?breakdown=product`), interleaving each product row (green, `kind='family'`) with a **% of Gross** row (italic, green).

All other behaviors—loading spinners, the “2.07 + Operacionais” sub‐percentages, click‐to‐detail—remain unchanged.

---

## 📂 Affected Files

1. Backend  
   - `pnl-matrix/lib/nfeProduct.ts`       ← **new**  
   - `pnl-matrix/app/api/cogs-details/route.ts` ← update for `breakdown=product`  
   - `pnl-matrix/app/api/nfe-details/route.ts` ← update for `breakdown=product`  

2. Frontend  
   - `pnl-matrix/components/PnLTable.tsx`   ← extensive updates  

---

## 🛠 Step‐by‐Step Code Changes

### 1) Backend: support `breakdown=product`

#### 1.1 Create `pnl-matrix/lib/nfeProduct.ts`

```ts
// pnl-matrix/lib/nfeProduct.ts
import { BigQuery } from '@google-cloud/bigquery'
import { FamilyKind } from './nfeFamily'  // reuse this type

const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.BQ_KEYFILE,
})

export interface ProductApiRow {
  produto: string        // parsed_x_prod_value
  ym: string             // 'YYYY-MM'
  valor: number
}

export async function fetchProductDetails(
  year: string,
  kind: FamilyKind
): Promise<ProductApiRow[]> {
  let filter = ''
  let selector = ''

  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      selector = 'parsed_total_product_value + parsed_frete_value'
      break

    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      selector = 'parsed_total_product_value + parsed_frete_value'
      break

    case 'Desconto':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')
                AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`
      selector = 'parsed_desconto_proportional_value'
      break

    case 'CPV':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break

    case 'CPV_Boni':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Bonificação'`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break

    case 'Perdas':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Baixa de estoque - Perda'`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break

    case 'CPV_Devol':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break

    default:
      throw new Error(`Unsupported kind for product breakdown: ${kind}`)
  }

  const sql = `
    SELECT
      parsed_x_prod_value AS produto,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
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

#### 1.2 Update `pnl-matrix/app/api/cogs-details/route.ts`

```diff
 export async function GET(req: Request) {
   const p = new URL(req.url).searchParams
   const ym = p.get('ym') ?? ''
   const year = p.get('year') ?? (ym ? ym.slice(0,4) : '')
   const kind = p.get('kind') ?? ''
   const breakdown = p.get('breakdown')

+  if (breakdown === 'product') {
+    if (!year) {
+      return NextResponse.json({ error: 'missing year for product breakdown' }, { status: 400 })
+    }
+    if (['CPV','CPV_Boni','Perdas','CPV_Devol'].includes(kind)) {
+      const { fetchProductDetails } = await import('@/lib/nfeProduct')
+      const rows = await fetchProductDetails(year, kind as any)
+      return NextResponse.json(rows)
+    }
+    return NextResponse.json({ error: `Product breakdown not supported for kind: ${kind}`}, { status: 400 })
+  }

   if (breakdown === 'family') {
     // … existing family logic …
   }
```

#### 1.3 Update `pnl-matrix/app/api/nfe-details/route.ts`

```diff
 import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily'
+import { fetchProductDetails } from '@/lib/nfeProduct'

 export async function GET(req: Request) {
   const p = new URL(req.url).searchParams
   const ym = p.get('ym') ?? ''
   const kind = p.get('kind') ?? ''
   const year = p.get('year') ?? (ym ? ym.slice(0,4) : '')
   const breakdown = p.get('breakdown')

+  if (breakdown === 'product') {
+    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
+    if (['ReceitaBruta','Devolucao','Desconto'].includes(kind)) {
+      const rows = await fetchProductDetails(year, kind as FamilyKind)
+      return NextResponse.json(rows)
+    }
+    return NextResponse.json({ error: 'unsupported kind for product breakdown' }, { status: 400 })
+  }

   // --- family drill-down -------------------------------------------
   if (breakdown === 'family') {
     if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
     if (!['ReceitaBruta','Devolucao','Desconto'].includes(kind))
       return NextResponse.json({ error: 'unsupported kind' }, { status: 400 })
     return NextResponse.json(await fetchFamilyDetails(year, kind as FamilyKind))
   }
   // -----------------------------------------------------------------
```

---

### 2) Frontend: `pnl-matrix/components/PnLTable.tsx`

#### 2.1 Imports & state

```diff
'use client'
 import { FamilyApiRow } from '@/lib/nfeFamily'
+import type { ProductApiRow } from '@/lib/nfeProduct'

   const [familyData,    setFamilyData]    = useState<Record<string,Node[]>>({})
   const [loadingMap,    setLoadingMap]    = useState<Record<string,boolean>>({})
+  const [productData,   setProductData]   = useState<Record<string,Node[]>>({})
+  const [loadingProdMap,setLoadingProdMap]= useState<Record<string,boolean>>({})
   const [dataVersion,   setDataVersion]   = useState(0)
```

#### 2.2 Add `pivotProducts` helper

```ts
// ... below pivotFamilies …

function pivotProducts(api: ProductApiRow[], parentId: string, months: Month[]): Node[] {
  const byProd = new Map<string,Node>()
  for (const r of api) {
    const id = `${parentId}_prod_${r.produto.replace(/\W+/g,'_')}`
    const node = byProd.get(r.produto) ?? {
      id, parentId,
      label: r.produto,
      kind: 'family',
      values: Object.fromEntries(months.map(m=>[m,0])) as Record<Month,number>
    }
    node.values[r.ym as Month] += r.valor
    byProd.set(r.produto, node)
  }
  return Array.from(byProd.values())
}
```

#### 2.3 Update `getRowCanExpand`

```diff
   const table = useReactTable({
     // …
-    getRowCanExpand: (r) => ['1','2','5','7','8','9','10'].includes(r.original.id)
-                       || (childMap[r.original.id]?.length ?? 0) > 0,
+    getRowCanExpand: (r) =>
+      ['1','2','5','7','8','9','10'].includes(r.original.id)
+      || r.original.id.endsWith('_breakdown_familia')
+      || r.original.id.endsWith('_breakdown_produto')
+      || (childMap[r.original.id]?.length ?? 0) > 0,
     getSubRows,
     getCoreRowModel: getCoreRowModel(),
     getExpandedRowModel: getExpandedRowModel()
   })
```

#### 2.4 Refactor **expander**‐cell `onClick`

Inside the expander `<button onClick={async ()=>{…}}>`:

```diff
       const isGrossRow    = row.original.id === '1'
       const isReturnsRow  = row.original.id === '2'
       const isDiscountRow = row.original.id === '5'
       const isCpvRow      = row.original.id === '7'
       const isCpvBoniRow  = row.original.id === '8'
       const isPerdasRow   = row.original.id === '9'
       const isCpvDevolRow = row.original.id === '10'
+      const isBreakFamilia = row.original.id.endsWith('_breakdown_familia')
+      const isBreakProduto = row.original.id.endsWith('_breakdown_produto')

         onClick={async () => {
-          if ((isGrossRow||isReturnsRow||isDiscountRow||isCpvRow||isCpvBoniRow||isPerdasRow||isCpvDevolRow)
-             && !familyData[cacheKey] && !loadingMap[cacheKey]) {
+          // 1) first‐level drilldown → “Familia” + “Produto”
+          if (['1','2','5','7','8','9','10'].includes(row.original.id)
+              && !familyData[cacheKey] && !loadingMap[cacheKey]) {
             setLoadingMap(p => ({ ...p, [cacheKey]: true }))
             try {
               // … existing fetch & setFamilyData(pivotFamilies) …
             } finally {
               setLoadingMap(p => ({ ...p, [cacheKey]: false }))
             }
-          }
+          }
+          // 2) click “Familia”
+          else if (isBreakFamilia && !familyData[cacheKey] && !loadingMap[cacheKey]) {
+            setLoadingMap(p => ({ ...p, [cacheKey]: true }))
+            try {
+              const parent = row.original.parentId!
+              const apiKind = { '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' }[parent]
+              const endpoint = parent === '1' ? '/api/nfe-details' : '/api/cogs-details'
+              const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=family`)
+              const rows = await res.json() as FamilyApiRow[]
+              setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }))
+              setDataVersion(v => v + 1)
+            } finally {
+              setLoadingMap(p => ({ ...p, [cacheKey]: false }))
+            }
+          }
+          // 3) click “Produto”
+          else if (isBreakProduto && !productData[cacheKey] && !loadingProdMap[cacheKey]) {
+            setLoadingProdMap(p => ({ ...p, [cacheKey]: true }))
+            try {
+              const parent = row.original.parentId!
+              const apiKind = { '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' }[parent]
+              const endpoint = parent === '1' ? '/api/nfe-details' : '/api/cogs-details'
+              const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=product`)
+              const rows = await res.json() as ProductApiRow[]
+              setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }))
+              setDataVersion(v => v + 1)
+            } finally {
+              setLoadingProdMap(p => ({ ...p, [cacheKey]: false }))
+            }
+          }
```

#### 2.5 Revise `getSubRows`

```diff
 const getSubRows = (n: Node) => {
   const cacheKey = `${n.id}_${year}`

+  // 1) Top‐level → two intermediates
+  if (['1','2','5','7','8','9','10'].includes(n.id)) {
+    return [
+      { id:`${n.id}_breakdown_familia`, parentId:n.id, label:'Familia', kind:'intermediate', values:{} as any },
+      { id:`${n.id}_breakdown_produto`, parentId:n.id, label:'Produto', kind:'intermediate', values:{} as any }
+    ]
+  }
+
+  // 2) “Familia” ► pivot families + % of Gross
+  if (n.id.endsWith('_breakdown_familia')) {
+    if (loadingMap[cacheKey]) {
+      return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', values:{} as any, kind:'loading' }]
+    }
+    const fams = familyData[cacheKey] ?? []
+    const gross = data.find(d => d.id==='1')
+    if (!gross) return fams
+    return fams.flatMap(fam => {
+      const pct = Object.fromEntries(months.map(m=>[
+        m, gross.values[m] ? (fam.values[m]/gross.values[m])*100 : 0
+      ])) as Record<Month,number>
+      return [ fam, { id:`${fam.id}_percGross`, parentId:fam.parentId, label:'', kind:'detailPercentage', values:pct } ]
+    })
+  }
+
+  // 3) “Produto” ► pivot products + % of Gross
+  if (n.id.endsWith('_breakdown_produto')) {
+    if (loadingProdMap[cacheKey]) {
+      return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', values:{} as any, kind:'loading' }]
+    }
+    const prods = productData[cacheKey] ?? []
+    const gross = data.find(d => d.id==='1')
+    if (!gross) return prods
+    return prods.flatMap(prod => {
+      const pct = Object.fromEntries(months.map(m=>[
+        m, gross.values[m] ? (prod.values[m]/gross.values[m])*100 : 0
+      ])) as Record<Month,number>
+      return [ prod, { id:`${prod.id}_percGross`, parentId:prod.parentId, label:'', kind:'detailPercentage', values:pct } ]
+    })
+  }
+
   // 4) existing “2.07 + Operacionais” …
   if (n.id === 'grp_2.07 + Operacionais') {
     /* … unchanged … */
   }
 
   // 5) all others
-  if (['1','2','5','7','8','9','10'].includes(n.id)) { … }
   return childMap[n.id] ?? []
 }
```

---

## ✅ After Applying

1. Click a top‐level row → you see **exactly two** child rows: **“Familia”** and **“Produto”** (dark‐blue `intermediate` style).  
2. Click **“Familia”** → loads & pivots *family* rows, interleaved with **% of Gross** rows (green, `detailPercentage`).  
3. Click **“Produto”** → loads & pivots *product* rows (grouped by `parsed_x_prod_value`), interleaved with **% of Gross** rows (green).  
4. Existing features—loading states, drilldown for “2.07 + Operacionais”, and click‐to‐detail—remain untouched.  
5. No additional backend endpoints; we’ve simply extended the two existing detail APIs to support `breakdown=product`.
```
