# 🎯 PRD – Skip Tax Payment Expenses inside “2.10 + Desconsiderados”

## Why
We now compute all tax amounts via the **Taxes** section (#3 & #4).  The same tax outflows also appear inside the expense branch **“2.10 + Desconsiderados”** (e.g. *COFINS*, *ICMS SP*, *PIS*). Showing them twice over‑states total expenses. We need to **exclude** those specific sub‑lines from the expense tree **and** from totals.

## Target lines to ignore
Under the group node whose `codigo_e_descricao` equals **`2.10 + Desconsiderados`**:
- Any `categoria_descricao` **exactly** `PIS` or `COFINS`
- Any `categoria_descricao` that **begins with** `ICMS` (e.g. `ICMS RJ`, `ICMS ST RJ`)

Everything else in that 2.10 group (e.g. *Empréstimo*, *Mercadorias*) must stay.

---
## Implementation (TypeScript‑side – no SQL change)

### 1  Add helper predicate in **`lib/pnlLogic.ts`**
```ts
function isIgnoredTaxExpense(raw: RawDespesa): boolean {
  if (raw.codigo_e_descricao !== '2.10 + Desconsiderados') return false
  const cat = raw.categoria_descricao.trim().toUpperCase()
  if (cat === 'PIS' || cat === 'COFINS') return true
  return cat.startsWith('ICMS')        // matches ICMS RJ, ICMS ST SP, etc.
}
```
*(place near the top of the file, under imports)*

### 2  Apply filter inside **`pivotDespesas()`**
Locate the loop:
```ts
for (const r of rows) {
  // existing code…
```
Add a guard at the very top:
```ts
  if (isIgnoredTaxExpense(r)) continue   // 🚫 skip duplicate tax expenses
```

### 3  Rebuild group & root totals – already automatic
Because we *never add* the skipped rows’ amounts, both the `2.10` group node and the overall **Despesas** totals will automatically reduce; nothing else to change.

### 4  UI – no change needed
The skipped categories will simply not appear; caret logic remains intact.

### 5  Optional SQL optimisation (not required)
If you prefer filtering in SQL, append to the existing MySQL query:
```sql
AND NOT (
  cp.codigo_categoria LIKE '2.10.%' AND (
    cat.descricao    IN ('PIS','COFINS') OR
    cat.descricao    LIKE 'ICMS%'
  )
)
```
But the TypeScript guard is simpler and keeps the query readable.

---
## Validation checklist
1. Re‑run `pnpm dev`, open **/pnl?year=2025**.
2. Expand **2.10 + Desconsiderados** ➜ sub‑lines *PIS*, *COFINS*, *ICMS …* no longer listed.
3. Monthly amounts for the 2.10 parent decrease by the sums of skipped lines.
4. Grand‑total expense & Net Profit now match the tax lines’ negatives.

That’s it – copy the helper + guard, restart, duplicates are gone.

