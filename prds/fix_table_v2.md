# 🔧  Eliminating Duplicate `categoria_descricao` Rows

This revision gives you **one authoritative fix**: guarantee every *categoria* node has a **valid parentId** *and* strip any orphan nodes before returning data to the table.

Follow the three patches below, then restart `pnpm dev` and the extra rows disappear 👋🏻.

---
## 1  Patch **`lib/pnlLogic.ts`** – new, safer `pivotDespesas()`

Replace your whole existing `pivotDespesas` helper with **this version**:

```ts
// lib/pnlLogic.ts  — inside this file
import { fetchDespesas } from './despesas'
import { PnLNode, Month, emptyYear } from './pnlLogic'   // adjust path if needed

export async function pivotDespesas(year: number): Promise<PnLNode[]> {
  const rows = await fetchDespesas(year)

  const months = Object.keys(emptyYear(year)) as Month[]
  const rootId = 'other'

  // — track structures —
  const groups: Record<string, PnLNode> = {}
  const subs  : Record<string, PnLNode> = {}

  // — iterate MySQL rows —
  for (const r of rows) {
    if (!r.codigo_e_descricao || !r.categoria_descricao) continue  // guard

    const groupId = `grp_${r.codigo_e_descricao}`               // uniq key
    const subId   = `sub_${r.codigo_e_descricao}__${r.categoria_descricao}`
    const m       = r.Periodo as Month
    const v       = Number(r.valor_documento)

    // 1️⃣ group node (id, parent = other)
    if (!groups[groupId]) {
      groups[groupId] = {
        id: groupId,
        parentId: rootId,
        label: r.codigo_e_descricao,
        sign: '-',
        values: emptyYear(year)
      }
    }
    groups[groupId].values[m] -= v

    // 2️⃣ sub‑category node (id, parent = group)
    if (!subs[subId]) {
      subs[subId] = {
        id: subId,
        parentId: groupId,      // <<< THIS prevents top‑level orphans
        label: r.categoria_descricao,
        sign: '-',
        values: emptyYear(year)
      }
    }
    subs[subId].values[m] -= v
  }

  // 3️⃣ root subtotal = Σ(groups)
  const despesasRoot: PnLNode = {
    id: rootId,
    label: 'Other Expenses',
    sign: '-',
    values: emptyYear(year)
  }
  months.forEach((m) => {
    for (const g of Object.values(groups)) {
      despesasRoot.values[m] += g.values[m]
    }
  })

  return [
    despesasRoot,
    ...Object.values(groups),
    ...Object.values(subs)
  ]
}
```

**Why this works**
1. The **only** nodes with `parentId: 'other'` are the group rows.  
2. Every `categoria_descricao` row gets `parentId = groupId`, *never* undefined.
3. Guard clause skips any malformed DB rows.

---
## 2  Add a quick orphan‑filter (defensive)

Right before you return the final tree from **`buildPnl`** (or wherever you merge revenue + despesas), insert:

```ts
const tree = [ ...revenueStuff, ...await pivotDespesas(year) ]

// 🚦 remove any node inadvertently missing parentId that *should* have one
const validIds = new Set(tree.map((n) => n.id))
const cleaned  = tree.filter(
  (n) => !n.parentId || validIds.has(n.parentId)
)
return cleaned
```

Even if a rogue node sneaks in, it’s filtered out.

---
## 3  Update default expanded map in **`components/PnLTable.tsx`**

If you previously expanded `'exp'`, switch to:

```tsx
const [expanded, setExpanded] = useState<Record<string, boolean>>({
  rev: true,
  other: true,          // open the dynamic expenses root
})
```

Nothing else in the table component needs changing.

---
### 🏁  Verification checklist
1. `pnpm dev` and head to `/pnl` – only **one** instance of each `categoria_descricao`.  
2. Console‑log `tree.filter(n => !n.parentId)` – should list only root nodes: Revenue, Other Expenses, etc.  
3. Expanding every group shows the expected sub‑lines and totals continue to match.

If you still see duplicates, send me the `console.log` of nodes where `parentId === undefined` or `parentId === 'other'` and I’ll dive deeper.

