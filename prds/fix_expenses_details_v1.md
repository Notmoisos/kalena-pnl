PRD — Restore Click-to-Popup for Despesas Sub-Categories
────────────────────────────────────────────────────────

Problem  
• After the tax-row refactor we tightened the “clickable” rule in `components/PnLTable.tsx`.  
• `isButtonClickable` now returns `true` **only** for:
  – revenue/COGS leaves (`revMap`)  
  – tax leaves (`isTaxChild`)  
  – (optionally) other explicit leaves we later add.  
• Expense sub-rows (IDs that start with `sub_…`) are still leaves but no longer pass the `isButtonClickable` test, so the cells render as plain `<span>` instead of `<button>` and the modal never opens.

Goal  
Bring back the old behaviour: **any non-intermediate, non-expandable row** (i.e. a true leaf in the table) should render as a clickable button.  
The on-click logic must keep the three specialised branches we added:

1. Revenue/COGS  → `/api/nfe-details` (existing `revMap`)  
2. Taxes (tax3, tax4, IPI) → `/api/tax-details` (regex logic)  
3. Everything else (expenses) → `/api/despesa-details` via the fallback branch already in `openDetailsModal`

Fix Strategy  
1. Loosen `isButtonClickable` back to **all** clickable leaves (`isClickableLeaf`) instead of a restricted subset.  
2. Keep the on-click branch order exactly as today:
   • first test `revMap` / Revenue–COGS  
   • then `isTaxChild` / Taxes  
   • finally the generic fallback (Despesas or any other leaf)  
3. No changes needed in `page.tsx` or modal components; the fallback branch already opens `DespesaDetailsModal`.

Code Changes
────────────
File: `pnl-matrix/components/PnLTable.tsx`

```diff
-        // Determine if the cell should be a button
-        const isButtonClickable = isClickableLeaf && (revMap[row.original.id] || isTaxChild);
+        // Any real leaf should be a button; special logic happens *inside* onClick
+        const isButtonClickable = isClickableLeaf;
```

*(The remainder of the click-handler stays unchanged; the `else if (isClickableLeaf)` fallback at the bottom already routes Despesa rows correctly.)*

Edge-Cases / Regression-Test
1. Revenue (row id `'1'` etc.) – still clickable → Nfe modal.  
2. Tax rows (`tax3_PIS_Venda`, `tax4_ICMS_ST_Devolucao`, `taxIPI`) – still clickable → Tax modal.  
3. Expense sub-rows (`sub_2.07__Fretes e carretos`) – clickable again → Despesa modal.  
4. Intermediate or parent rows (`tax3`, `2.07 + Operacionais`) – remain non-clickable.  
5. No accidental double-loading of modals; table renders without console warnings.

Implementation Steps
1. Edit `PnLTable.tsx` and replace the single line shown above.
2. Restart or let Next.js hot-reload.
3. Validate all three modal types open as expected.

That single-line change restores Despesas clickability without affecting the new tax functionality.
