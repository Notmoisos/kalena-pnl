# Fixing Duplicate `categoria_descricao` Rows in Your P&L Table

## 🧐 Problem

After integrating MySQL “despesas”, you see each **`categoria_descricao`** row twice:

1. **Under its parent `codigo_e_descricao`** (correct) when you expand the group.  
2. **At the top level** of the table (incorrect).

This happens because you still have a **static “Other Expenses”** branch in your base data _and_ you’re now injecting a **dynamic despesas** branch.  Your table shows both:

- The **static** rows (from `buildMockPnl` or mockData)  
- The **dynamic** rows (from `pivotDespesas` / MySQL)


## ✅ Goal of the fix

» **Remove** the old static “Other Expenses” _tree_.  
» **Use only** the dynamic despesas data under one root (e.g. `id: 'other'`).

Afterward, each category appears only **once**, nested under its group.


---
## 🛠 Step‑by‑step Fix

### 1. Locate & remove the static “Other Expenses” code

Open **`lib/pnlLogic.ts`** (or wherever your `buildMockPnl` lives) and find the block that builds the “Other Expenses” root and its children.  It might look like:

```ts
// Example of static branch in buildMockPnl
const otherRoot: PnLNode = { id: 'other', label: 'Other Expenses', values: emptyYear(year) };
const adm: PnLNode = { id: 'adm', parentId: 'other', label: 'Administrative', values: emptyYear(year) };
const adm1: PnLNode = { id: 'adm1', parentId: 'adm', ... };
// …and so on for people, insurance, etc.

return [
  ...revenueNodes,
  ...expenseRoots,
  otherRoot,
  adm,
  adm1,
  /* etc */
];
```

**Remove or comment out** that entire static `otherRoot` + children section so that **only** dynamic despesas are injected.


### 2. Align your dynamic root to `id: 'other'`

In **`lib/pnlLogic.ts`**, your `pivotDespesas` helper probably starts with:

```ts
const rootId = 'exp';    // old
const despesasRoot: PnLNode = { id: rootId, label: 'Despesas', values: emptyYear(year) };
```

**Change** it to:

```ts
const rootId = 'other';  // now uses same root as before
const despesasRoot: PnLNode = { id: rootId, label: 'Other Expenses', values: emptyYear(year) };
```

This ensures that the dynamic data appears under the **single** `other` branch.


### 3. Update initial `expanded` state in your table

In **`components/PnLTable.tsx`**, you likely seeded expansion like:

```ts
const [expanded, setExpanded] = useState({ rev: true, exp: true });
```

**Replace** `exp: true` with `other: true`:

```ts
const [expanded, setExpanded] = useState({ rev: true, other: true });
```

This ensures the dynamic “Other Expenses” root is open by default.


### 4. (Optional) Remove hard‑coded mock data for `Other Expenses`

If you still have **`lib/mockData.ts`** entries for expenses under `Periodo`, you can delete or ignore them, since MySQL now drives every despesa.


### 5. Restart & Verify

1. Stop the dev server: `Ctrl+C`  
2. Rebuild: `pnpm dev`  
3. Visit **`http://localhost:3000/pnl?year=2025`**  
4. Expand the **Other Expenses** root → you should see each `categoria_descricao` **only once** under its group.


---

### Do you need more info?
- If your static mock code is in a different file, let me know its path.  
- If you’d prefer a **diff** instead of prose, I can generate that.  
- If the duplicate issue persists after this change, share the `buildPnl(...)` snippet and I’ll debug further.

Good luck—soon you’ll have a **single, clean** despesas tree! 🎉

