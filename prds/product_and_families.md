# PRD: Two‐Level “Familia” / “Produto” Breakdown under Gross & COGS

## 🧐 Context & Goal

For these **top‐level** rows:

- **Receita Bruta** (`id='1'`)  
- **CPV** (`id='7'`)  
- **CPV Bonificações e Amostras** (`id='8'`)  
- **Perdas e Descartes** (`id='9'`)  
- **CPV Devoluções** (`id='10'`)  

we currently expand **directly** into *family* rows (green).  
We need instead a **two‐level** drilldown:

1. **First click** → show exactly **two** child rows:  
   - **“Familia”** (kind=`intermediate`)  
   - **“Produto”** (kind=`intermediate`)  

2. **Clicking “Familia”** → fetch `/api/cogs-details?breakdown=family` (or `/api/nfe-details` for Gross) → pivot into green *family* rows **with % of Gross** rows interleaved.

3. **Clicking “Produto”** → fetch `/api/cogs-details?breakdown=product` (or `/api/nfe-details?breakdown=product`) → pivot into green *product* rows **with % of Gross** rows interleaved.

All other behavior (loading spinners, 2.07 sub‐percentages, click-to-detail) remains unchanged.

---

## 📂 Affected Files

1. **Backend**  
   - `pnl-matrix/lib/nfeFamily.ts`  
   - **NEW** `pnl-matrix/lib/nfeProduct.ts`  
   - `pnl-matrix/app/api/cogs-details/route.ts`

2. **Frontend**  
   - `pnl-matrix/components/PnLTable.tsx`

---

## 🛠 Step‐by‐Step Code Changes

### 1) Backend: support `breakdown=product`

#### 1.1 Create `lib/nfeProduct.ts`

```ts
// pnl-matrix/lib/nfeProduct.ts
import { BigQuery } from '@google-cloud/bigquery'
const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.BQ_KEYFILE,
})

export interface ProductApiRow {
  produto: string
  ym: string
  valor: number
}

export async function fetchProductDetails(
  year: string,
  kind: string
): Promise<ProductApiRow[]> {
  // reuse same filters/selectors as nfeFamily for each kind, but GROUP BY parsed_x_prod_value
  let filter = ''
  let selector = ''
  switch (kind) {
    case 'CPV':
    case 'CPV_Boni':
    case 'Perdas':
    case 'CPV_Devol':
      // copy filter/selector logic from nfeFamily.ts for each case
      // … e.g. for 'CPV': selector='parsed_unit_cost * parsed_quantity_units'; filter=… 
      break;
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
    LIMIT 500`

  const [rows] = await bq.query({ query: sql, params: { year } })
  return rows as ProductApiRow[]
}
```

#### 1.2 Update `app/api/cogs-details/route.ts`

```diff
 export async function GET(req: Request) {
   const breakdown = p.get('breakdown');

+  if (breakdown === 'product') {
+    if (!year) {
+      return NextResponse.json({ error: 'missing year for product breakdown' }, { status: 400 });
+    }
+    if (['CPV','CPV_Boni','Perdas','CPV_Devol'].includes(kind)) {
+      const rows = await fetchProductDetails(year, kind);
+      return NextResponse.json(rows);
+    }
+    return NextResponse.json({ error: `Product breakdown not supported for kind: ${kind}`}, { status: 400 });
+  }
 
   if (breakdown === 'family') {
     // … existing family logic …
   }
```

---

### 2) Frontend: two‐level drilldown in `PnLTable.tsx`

#### 2.1 Add new state hooks

```diff
   const [familyData, setFamilyData] = useState<Record<string, Node[]>>({})
   const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
+  const [productData, setProductData] = useState<Record<string, Node[]>>({})
+  const [loadingProductMap, setLoadingProductMap] = useState<Record<string, boolean>>({})
   const [dataVersion, setDataVersion] = useState(0)
```

#### 2.2 Add `pivotProducts` helper (below `pivotFamilies`)

```ts
 function pivotProducts(api: ProductApiRow[], parentId: string, months: Month[]): Node[] {
   const byProd = new Map<string, Node>()
   for (const r of api) {
     const id = `${parentId}_prod_${r.produto.replace(/\W+/g,'_')}`
     const node = byProd.get(r.produto) ?? {
       id, parentId,
       label: r.produto,
       kind: 'family',
       values: Object.fromEntries(months.map(m => [m, 0])) as Record<Month,number>
     }
     node.values[r.ym as Month] += r.valor
     byProd.set(r.produto, node)
   }
   return Array.from(byProd.values())
 }
```

#### 2.3 Refactor **expander**‐cell onClick

Find the button under `cell: ({ row }) =>` and replace its data‐fetch logic:

```diff
- if ((isGrossRow || isReturnsRow || isDiscountRow
-      || isCpvRow || isCpvBoniRow || isPerdasRow || isCpvDevolRow)
-     && !familyData[cacheKey] && !loadingMap[cacheKey]) {
+ const isBreakFamilia = row.original.id.endsWith('_breakdown_familia')
+ const isBreakProduto = row.original.id.endsWith('_breakdown_produto')
+
+ // 1) Gross/Returns/Discount → fetch “family” as before
+ if ((isGrossRow || isReturnsRow || isDiscountRow)
+     && !familyData[cacheKey] && !loadingMap[cacheKey]) {
     setLoadingMap(p => ({ ...p, [cacheKey]: true }))
     try {
       // …existing fetch & setFamilyData( pivotFamilies )…
     } finally {
       setLoadingMap(p => ({ ...p, [cacheKey]: false }))
     }
- }
+ }
+
+ // 2) “Familia” breakdown under CPV groups
+ else if (isBreakFamilia && !familyData[cacheKey] && !loadingMap[cacheKey]) {
+   setLoadingMap(p => ({ ...p, [cacheKey]: true }))
+   try {
+     const parent = row.original.parentId!
+     const apiKind = { '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' }[parent]
+     const res = await fetch(`/api/cogs-details?year=${year}&kind=${apiKind}&breakdown=family`)
+     const rows = await res.json() as FamilyApiRow[]
+     setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }))
+     setDataVersion(v => v + 1)
+   } finally {
+     setLoadingMap(p => ({ ...p, [cacheKey]: false }))
+   }
+ }
+
+ // 3) “Produto” breakdown under CPV groups
+ else if (isBreakProduto && !productData[cacheKey] && !loadingProductMap[cacheKey]) {
+   setLoadingProductMap(p => ({ ...p, [cacheKey]: true }))
+   try {
+     const parent = row.original.parentId!
+     const apiKind = { '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' }[parent]
+     const res = await fetch(`/api/cogs-details?year=${year}&kind=${apiKind}&breakdown=product`)
+     const rows = await res.json() as ProductApiRow[]
+     setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }))
+     setDataVersion(v => v + 1)
+   } finally {
+     setLoadingProductMap(p => ({ ...p, [cacheKey]: false }))
+   }
+ }
```

#### 2.4 Revise `getSubRows` logic

Replace the **CPV & family‐direct** blocks with this:

```diff
 const getSubRows = (n: Node) => {
   const cacheKey = `${n.id}_${year}`

+  // ── 1) Top‐level drilldown for COGS/Gross rows: two intermediate children
+  if (['1','7','8','9','10','2','5'].includes(n.id)) {
+    // only CPV‐family for 7–10; others still do family on first level
+    if (['7','8','9','10'].includes(n.id)) {
+      return [
+        { id:`${n.id}_breakdown_familia`, parentId:n.id, label:'Familia',   kind:'intermediate', values:{} as any },
+        { id:`${n.id}_breakdown_produto`, parentId:n.id, label:'Produto',   kind:'intermediate', values:{} as any }
+      ] as Node[]
+    }
+    // keep existing for Gross/Returns/Discount
+    if (loadingMap[cacheKey]) {
+      return [{ id:`loading_${cacheKey}`, parentId:n.id, label:'Carregando…', values:{} as any, kind:'loading' }]
+    }
+    return familyData[cacheKey] ?? []
+  }
+
+  // ── 2) “Familia” node expanded under COGS
+  if (n.id.endsWith('_breakdown_familia')) {
+    if (loadingMap[cacheKey]) {
+      return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', values:{} as any, kind:'loading' }]
+    }
+    const fams = familyData[cacheKey] ?? []
+    const gross = data.find(d => d.id === '1')
+    if (!gross) return fams
+    return fams.flatMap(fam => {
+      const pct = Object.fromEntries(months.map(m => [
+        m, gross.values[m] ? (fam.values[m]/gross.values[m])*100 : 0
+      ])) as Record<Month,number>
+      return [ fam, { id:`${fam.id}_percGross`, parentId:fam.parentId, label:'', kind:'detailPercentage', values:pct } ]
+    })
+  }
+
+  // ── 3) “Produto” node expanded under COGS
+  if (n.id.endsWith('_breakdown_produto')) {
+    if (loadingProductMap[cacheKey]) {
+      return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', values:{} as any, kind:'loading' }]
+    }
+    const prods = productData[cacheKey] ?? []
+    const gross = data.find(d => d.id === '1')
+    if (!gross) return prods
+    return prods.flatMap(prod => {
+      const pct = Object.fromEntries(months.map(m => [
+        m, gross.values[m] ? (prod.values[m]/gross.values[m])*100 : 0
+      ])) as Record<Month,number>
+      return [ prod, { id:`${prod.id}_percGross`, parentId:prod.parentId, label:'', kind:'detailPercentage', values:pct } ]
+    })
+  }
+
   // ── 4) Existing “2.07 + Operacionais” …
   if (n.id === 'grp_2.07 + Operacionais') { /* …unchanged… */ }

-  if (['1','2','5','7','8','9','10'].includes(n.id)) { … }
+  // other drilldowns: taxes, discounts, 2.07, generics
   return childMap[n.id] ?? []
 }
```

---

## ✅ After Applying

1. **Click** on any of the five top-level rows → you see exactly two children: **“Familia”** and **“Produto”** (dark-blue intermediate style).  
2. **Click “Familia”** → you load & pivot the same *family* rows as before, **interleaved** with %‐of‐Gross rows (green).  
3. **Click “Produto”** → you load & pivot *product* rows (grouped by `parsed_x_prod_value`), **interleaved** with %‐of‐Gross rows (green).  
4. All existing hot-reload, click‐to-detail, and 2.07 behavior remains untouched.

Let me know if you’d like any clarifications or adjustments!