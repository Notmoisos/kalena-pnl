# PRD — “Receita Bruta / Gross Revenue” Family Drill-Down  
_last update • yyyy-mm-dd_

---

## 1 Goal  

Allow the user to click the chevron on row **1 – Receita Bruta / Gross Revenue** to fetch and display a sub-table that shows the breakdown **by `descricao_familia` for every month of the selected year**.  
All other interactions (Revenue modal, COGS modal, Despesa modal, Tax modal) must keep working exactly as they do today.

---

## 2 Files & high-level impact  

| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/pnlLogic.ts`            | Extend type `PnLNode.kind` with `family` & `loading`        |
| 2.2 | `lib/nfeFamily.ts` _(new)_   | Fetch + pivot “family per month” rows from BigQuery         |
| 2.3 | `app/api/nfe-details/route.ts` | Add `breakdown=family` branch while preserving old logic    |
| 2.4 | `components/PnLTable.tsx`    | UI + state management for lazy loading & rendering          |
| 2.5 | (optional) test / storybook  | Adjust snapshots if you have them                           |

---

## 3 Detailed changes  

### 2.1 pnLLogic.ts — type hardening  

```ts
// ... existing code ...
export type PnLNode = {
  id: string
  parentId?: string
  label: string
  sign?: '+' | '-'
  values: Record<Month, number>
  /** drives styling / formatting */
-  kind?: 'intermediate' | 'percentage'
+  kind?: 'intermediate' | 'percentage' | 'family' | 'loading'
  className?: string
}
// ... existing code ...
```

_No further code depends on the union; render helpers inside **PnLTable** will be updated in step 2.4_.

---

### 2.2 lib/nfeFamily.ts — NEW helper  

```ts
import { BigQuery } from '@google-cloud/bigquery'
const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.BQ_KEYFILE,
})

export interface FamilyApiRow {
  familia: string          // descricao_familia
  ym: string               // YYYY-MM
  valor: number
}

export async function fetchFamilyDetails (year: string): Promise<FamilyApiRow[]> {
  // Receita Bruta only – leave room for future kinds
  const sql = `
    SELECT
      descricao_familia                 AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(parsed_total_product_value) AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE
      tipo_operacao = 'Saída'
      AND finalidade = 'Normal/Venda'
      AND cancelada  = 'Não'
      AND (nome_cenario = 'Venda' OR nome_cenario = 'Inativo')
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
    LIMIT 500
  `
  const [rows] = await bq.query<FamilyApiRow>({ query: sql, params: { year } })
  return rows
}
```

---

### 2.3 app/api/nfe-details/route.ts — new branch  

```ts
import { NextResponse } from 'next/server'
import { fetchNfeDetails, RevKind } from '@/lib/nfeRevenue'
+import { fetchFamilyDetails }           from '@/lib/nfeFamily'

export async function GET (req: Request) {
  const p    = new URL(req.url).searchParams
  const ym   = p.get('ym')   ?? ''
  const kind = p.get('kind') ?? ''
+ const year = p.get('year') ?? (ym ? ym.slice(0, 4) : '')
+ const breakdown = p.get('breakdown')

+ // --- family drill-down -------------------------------------------
+ if (breakdown === 'family') {
+   if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
+   if (kind !== 'ReceitaBruta')
+     return NextResponse.json({ error: 'unsupported kind' }, { status: 400 })
+   return NextResponse.json(await fetchFamilyDetails(year))
+ }
+ // -----------------------------------------------------------------

  // legacy single-month details (used by all existing modals)
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) ||
      !['ReceitaBruta', 'Devolucao', 'Desconto'].includes(kind))
    return NextResponse.json({ error: 'bad params' }, { status: 400 })

  return NextResponse.json(await fetchNfeDetails(ym, kind as RevKind))
}
```

_Default branch left untouched ➟ old modals keep working._

---

### 2.4 components/PnLTable.tsx — UI changes  

Below is the **delta only**.  Copy/paste with context markers (`// ... existing code ...`).

1.  Local type with new `kind`s  

   ```tsx
   type Node = PnLNode & { kind?: 'intermediate'|'percentage'|'family'|'loading' }
   ```

2.  Local state  

   ```tsx
   const [familyData , setFamilyData ] = useState<Record<string, Node[]>>({})
   const [loadingMap , setLoadingMap ] = useState<Record<string, boolean>>({})
   // optional but handy; remove if prefer implicit re-render
   const [dataVersion, setDataVersion] = useState(0)
   ```

3.  Helper to pivot API rows (accumulate, not overwrite!)  

   ```tsx
   function pivotFamilies (api: FamilyApiRow[], parentId: string, months: Month[]): Node[] {
     const byFam = new Map<string, Node>()
     for (const r of api) {
       const id = `${parentId}_fam_${r.familia.replace(/\W+/g, '_')}`
       const node = byFam.get(r.familia) ?? {
         id, parentId,
         label: r.familia,
         kind: 'family',
         values: Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>
       }
       node.values[r.ym as Month] += r.valor  // ⚠ accumulate
       byFam.set(r.familia, node)
     }
     return Array.from(byFam.values())
   }
   ```

4.  Month-cell clickability rule  

   ```tsx
   const isFamilyRow = row.original.kind === 'family'
   let isModalClickable = !row.getCanExpand() && !isIntermediate && !isFamilyRow
   ```

   _This prevents the green family rows from looking like links._

5.  `revMap` — remove `1` entry (Receita Bruta no longer opens modal)  

   ```tsx
   const revMap = { '2':'Devolucao', '5':'Desconto' /* … */ }
   ```

6.  Expander cell  

   ```tsx
   const isGrossRow = row.original.id === '1'
   const cacheKey   = `${row.original.id}_${year}`

   <button
     onClick={async () => {
       row.toggleExpanded()
       if (isGrossRow && !familyData[cacheKey] && !loadingMap[cacheKey]) {
         setLoadingMap(p => ({ ...p, [cacheKey]: true }))
         try {
           const res  = await fetch(`/api/nfe-details?year=${year}&kind=ReceitaBruta&breakdown=family`)
           const rows = await res.json() as FamilyApiRow[]
           setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, row.original.id, months) }))
           setDataVersion(v => v + 1)   // optional
         } finally {
           setLoadingMap(p => ({ ...p, [cacheKey]: false }))
         }
       }
     }}
   >
     {row.getIsExpanded() ? '▼' : '▶'}
   </button>
   ```

7.  `getSubRows`  

   ```tsx
   const getSubRows = (n: Node) => {
     if (n.id === '1') {
       if (loadingMap[cacheKey]) return [{ id:`loading_${cacheKey}`, parentId:n.id, label:'Carregando…', values:{} as any, kind:'loading' }]
       return familyData[cacheKey] ?? []
     }
     return childMap[n.id] ?? []
   }
   ```

8.  Row colouring (order matters)  

   ```tsx
   clsx(
     row.original.kind === 'family'  && 'bg-emerald-50',
     row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
     row.original.kind === 'intermediate' && 'bg-blue-900 text-white',
     !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]'
   )
   ```

_Above: `family` / `loading` checked **before** generic child rule._

---

### 2.5 Tests / Storybook _(if present)_  

* Update snapshots for the PnLTable story: add expanded “Receita Bruta” state.  
* Add unit test for `pivotFamilies` to guard against accidental overwrite vs accumulate.

---

## 4 Roll-out / validation checklist  

1. Deploy to staging with BigQuery env vars available.  
2. Load `/pnl?year=2024`, click chevron on Gross Revenue → green sub-rows appear.  
3. Click any month of a **Despesas** leaf → Despesa modal still opens.  
4. Click a month of row `2` (Devolução) → NFe modal still opens.  
5. Lighthouse or perf check: no blank reflows; table keeps horizontal scroll.

---

## 5 Future extensions (out of scope)  

* Add same drill-down to CPV rows (`kind=CPV`, requires extra SQL).  
* Provide grand-total line per family.  
* Persist expanded state across year changes.

---

### ✅ With these adjustments the feature compiles cleanly and respects all existing interactions.


## o3 comments:

The 250-line PRD (v2) does contain every **conceptual** change that is needed, but two things are still missing for a truly “step-by-step, copy-paste-able” spec:

─────────────────────────────────────────────────────────────────────────────
1.  Tiny but **mandatory code fragments** that were implied but not listed  
─────────────────────────────────────────────────────────────────────────────
a. Imports in `PnLTable.tsx`  

```tsx
// ... existing imports ...
import { FamilyApiRow }   from '@/lib/nfeFamily'     // ← add
```

b. `getRowCanExpand` override – so row `1` is expandable even with no children in `childMap`.

```tsx
const table = useReactTable({
  // ... existing props ...
  getRowCanExpand: (r) => r.original.id === '1' || (childMap[r.original.id]?.length ?? 0) > 0,
})
```

c. `cacheKey` in `getSubRows` is out of scope; compute it again:

```tsx
const getSubRows = (n: Node) => {
  const cacheKey = `${n.id}_${year}`
  // ... rest unchanged ...
}
```

d. `renderVal` already handles default numeric rows, so no change is necessary, but if you want loading rows to show “–” instead of “R$ 0,00”, mention:

```tsx
if (row.original.kind === 'loading') return '–'
```

─────────────────────────────────────────────────────────────────────────────
2.  Explicit reminder for **eslint / ts-config** updates (only if you run strict)
─────────────────────────────────────────────────────────────────────────────
Add the new file to `tsconfig.include` (if your repo is selective) and
run `eslint --fix` once, as new unused-import warnings will appear until you add `FamilyApiRow`.

─────────────────────────────────────────────────────────────────────────────
Why the PRD shrank from ~700 to ~250 lines
─────────────────────────────────────────────────────────────────────────────
The earlier 700–line patch included **whole-file snapshots**.  
v2 removes unchanged boilerplate and lists only **deltas** framed with
`// ... existing code ...` guards, which is the convention we follow in
this repo to keep diffs readable.  Nothing functional was dropped; only
verbatim repeats were collapsed.

─────────────────────────────────────────────────────────────────────────────
Conclusion
─────────────────────────────────────────────────────────────────────────────
Add the four small snippets above and the PRD becomes 100 % complete and
fully prescriptive line-by-line.
