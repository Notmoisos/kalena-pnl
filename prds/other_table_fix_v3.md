Here’s a 🔧 design doc outlining exactly how to lift your MySQL‑driven expense groups into the top level—dropping the “Other Expenses” root—and still keep sub‑categories nested:

---

# Feature: Promote Expense Groups to Top Level

## Goal

- **Remove** the “Other Expenses” root row entirely.
- **Promote** each `codigo_e_descricao` (group) to be a root‑level row.
- **Keep** `categoria_descricao` rows nested under their group when expanded.
- No orphan or duplicate rows.

---

## 1. Change your pivot logic (`lib/pnlLogic.ts`)

### Before

```ts
// groupId has parentId = 'other' → this forces all groups under the "Other Expenses" root
groups[groupId] = { id: groupId, parentId: 'other', … }
…  
// you also returned a despesasRoot (the Other Expenses row)
return [despesasRoot, …groups, …subs]
```

### After

1. **Remove** any `rootId = 'other'` and the `despesasRoot` creation.
2. **Make group nodes root** by **omitting** `parentId` on them.
3. Keep sub‑nodes pointing to their `groupId`.

#### Sketch of revised `pivotDespesas`

```ts
export async function pivotDespesas(year: number): Promise<PnLNode[]> {
  const rows = await fetchDespesas(year)
  const months = Object.keys(emptyYear(year)) as Month[]
  
  const groups: Record<string, PnLNode> = {}
  const subs:   Record<string, PnLNode> = {}
  
  for (const r of rows) {
    if (!r.codigo_e_descricao || !r.categoria_descricao) continue
    
    const groupId = `grp_${r.codigo_e_descricao}`
    const subId   = `sub_${r.codigo_e_descricao}__${r.categoria_descricao}`
    const m = r.Periodo as Month
    const v = Number(r.valor_documento)
    
    // === GROUP (now root) ===
    if (!groups[groupId]) {
      groups[groupId] = {
        id: groupId,
        // parentId: undefined  <-- drop this line entirely
        label: r.codigo_e_descricao,
        sign: '-',
        values: emptyYear(year)
      }
    }
    groups[groupId].values[m] -= v
    
    // === SUB-CATEGORY (child of group) ===
    if (!subs[subId]) {
      subs[subId] = {
        id: subId,
        parentId: groupId,   // stays the same
        label: r.categoria_descricao,
        sign: '-',
        values: emptyYear(year)
      }
    }
    subs[subId].values[m] -= v
  }
  
  // return only groups + subs—no root “Other Expenses”
  return [
    ...Object.values(groups),
    ...Object.values(subs)
  ]
}
```

---

## 2. Merge into `buildPnl` (`lib/pnlLogic.ts`)

Your `buildPnl` currently does:

```ts
const base = buildMockPnl(year)
const despesas = await pivotDespesas(year)
const tree = [...base, ...despesas]
…filter orphans…
return cleaned
```

**Keep that**, but now `despesas` is just groups+subs (no “Other Expenses”).

---

## 3. Table component: feed only true roots

In **`PnLTable.tsx`**, you already do:

```ts
// split out rootRows = data.filter(n => !n.parentId)
```

- After this change, **rootRows** =  
  − revenue nodes from `base`  
  − **your group nodes** (because they now have no `parentId`)  

And sub‑rows only appear via:

```ts
getSubRows: (row) => childMap[row.id] ?? []
```

So you’ll get:

```
Revenue
  └─ Gross
  └─ Returns
  └─ Net
2.01 + Importação     ← group is a root now
  └─ Frete rodoviário contêiner
  └─ Outras importações
  └─ Seguro frete internacional
  └─ Despachante
2.02 + Tributárias    ← next group root
  └─ …
…etc…
```

---

## 4. Expanded–state tweak (if desired)

- You can leave `expanded = { rev: true }` so only Revenue is open by default.
- If you’d like certain expense groups open on load, add their IDs:
  ```ts
  const [expanded, setExpanded] = useState({ rev: true, ['grp_2.01 + Importação']: true })
  ```
- Otherwise, let users expand groups interactively.

---

## 5. Verification Steps

1. `pnpm dev` → open `/pnl?year=…`
2. **Top‑level** list should show:
   - “Revenue”  
   - “Receita Bruta …”  
   - “Devoluções …”  
   - “Receita Líquida …”  
   - **All your `grupo_despesa` rows** (e.g. “2.01 + Importação”, “2.02 + Tributárias”, etc.)
3. Expanding each group reveals its sub‑categories.
4. No “Other Expenses” row anywhere.
5. Totals still sum correctly (group sums come from pivot logic).

---

**That’s it!**  
With these changes, your expense groups live at the same level as revenue—and “Seguro frete internacional” (and every category) will appear only under its group, never duplicated at top level.
