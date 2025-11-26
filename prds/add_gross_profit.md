
Okay, here is the PRD outlining the exact changes needed to add the "Lucro Bruto" (Gross Profit) row and reposition the "Operacionais" expense group.

---

# PRD ▸ Add Lucro Bruto Intermediate Row

**Goal:** Introduce a new intermediate row, "Lucro Bruto / Gross Profit", calculated after moving the "2.07 + Operacionais" expense group directly below "Receita Operacional / Operating Income".

**Solution:**
1.  Modify `buildIntermediateRows` to calculate the new "Lucro Bruto" node.
2.  Update the return array structure in `buildPnl` to reflect the new position of "2.07 + Operacionais" and insert the "Lucro Bruto" row immediately after it.

---

## 1. `lib/pnlLogic.ts` - Logic Changes

### 1.1 `buildIntermediateRows` - Calculate Lucro Bruto

*   Update the function's return type to include `lucroBruto`.
*   Add logic to calculate `lucroBruto` = `opIncome` - `groups['grp_2.07 + Operacionais']`.
*   Return the new `lucroBruto` node.

```diff
 // pnl-matrix/lib/pnlLogic.ts

-export function buildIntermediateRows(nodes: Record<string, PnLNode>, groups: Record<string, PnLNode>, months: Month[]) {
+export function buildIntermediateRows(nodes: Record<string, PnLNode>, groups: Record<string, PnLNode>, months: Month[]): {
+  margem: PnLNode;
+  opIncome: PnLNode;
+  lucroBruto: PnLNode; // <-- Add new node to return type
+  ebitda: PnLNode;
+  netProfit: PnLNode;
+} {
   // ... existing calculations for margem, opIncome ...

+  const lucroBruto: PnLNode = {
+    id: 'lucroBruto',
+    label: 'Lucro Bruto / Gross Profit',
+    kind: 'intermediate',
+    className: 'bg-blue-900 text-white',
+    values: emptyYear(months[0].slice(0, 4) as unknown as number)
+  };
+  months.forEach(m => {
+    lucroBruto.values[m] = opIncome.values[m]
+      - (groups['grp_2.07 + Operacionais']?.values[m] || 0);
+  });
+
   // ... existing calculations for ebitda, netProfit ...

-  return { margem, opIncome, ebitda, netProfit };
+  return { margem, opIncome, lucroBruto, ebitda, netProfit }; // <-- Return new node
 }
```

### 1.2 `buildPnl` - Adjust Row Order

*   Destructure the new `lucroBruto` node from the `buildIntermediateRows` result.
*   Identify the "2.07 + Operacionais" group node.
*   Modify the final `return` array to place `opIncome`, then the "Operacionais" group (`op`), then `lucroBruto` in sequence. Remove "Operacionais" from the `mainGroups` filter.

```diff
 // pnl-matrix/lib/pnlLogic.ts

 export async function buildPnl(year: number): Promise<PnLNode[]> {
   // ... existing setup ...
   const { margem, opIncome, ebitda, netProfit } = buildIntermediateRows(nodes, groups, months); // Existing
+  const { lucroBruto } = buildIntermediateRows(nodes, groups, months); // Get new node

   // ... existing tax node finding ...

   // Expense group ordering
   const getGroup = (label: string) => Object.values(groups).find(g => g.label.includes(label));
   const imp = getGroup('2.01 + Importação');
+  const op = getGroup('2.07 + Operacionais'); // <-- Identify Operacionais group
   const fin6 = getGroup('2.06 + Financeiras');
   const fin2 = getGroup('2.02 + Tributárias');
   const other = getGroup('2.10 + Desconsiderados');
+
   // All other expense groups (filter out op now)
   const mainGroups = Object.values(groups).filter(g =>
-    ![imp?.id, fin6?.id, fin2?.id, other?.id].includes(g.id)
+    ![imp?.id, op?.id, fin6?.id, fin2?.id, other?.id].includes(g.id) // <-- Exclude op
   );
+
   const subExpenses = expenseLines.filter(e => e.id.startsWith('sub_'));

   // Final array as per PRD
   return [
     // Revenue Section
     nodes['1'], nodes['2'], taxRoot, ...taxChildren, stRoot, ...stChildren, nodes['5'],
     // Net Revenue + Margin
     nodes['6'], margem,
     // COGS Section
     nodes['7'], nodes['8'], nodes['9'], nodes['10'],
     // Operating Income, THEN Operacionais, THEN Lucro Bruto
     opIncome,
-    ...(imp ? [imp] : []), // <-- Remove imp from here
+    ...(op ? [op] : []), // <-- Add Operacionais group here
+    lucroBruto,          // <-- Add Lucro Bruto here
+    // Importação now comes after Lucro Bruto
+    ...(imp ? [imp] : []),
+    // Remaining main expense groups
     ...mainGroups,
+    // EBITDA and below
     ebitda,
     ...(fin6 ? [fin6] : []),
     ...(fin2 ? [fin2] : []),
     netProfit,
     ...(other ? [other] : []),
     ...subExpenses
   ];
 }
```

---

## 2. UI Changes (`components/PnLTable.tsx`)

✅ **None required.** The existing logic handles:
*   Rendering rows in the order provided by `buildPnl`.
*   Applying the `bg-blue-900 text-white` styling based on `kind: 'intermediate'`.
*   Disabling click/expand for intermediate rows.

---

## 3. Validation Checklist

1.  **Positioning:**
    *   Verify "Receita Operacional / Operating Income" is present.
    *   Verify "2.07 + Operacionais" (and its children, if expanded) appears immediately below it.
    *   Verify "Lucro Bruto / Gross Profit" appears immediately below "2.07 + Operacionais".
    *   Verify "2.01 + Importação" appears below "Lucro Bruto".
2.  **Calculation:** For any month, manually check: `Lucro Bruto` = `Receita Operacional` - `2.07 + Operacionais`.
3.  **Styling:** Verify "Lucro Bruto" has the dark blue background and white text, matching other intermediate rows like "Receita Líquida" or "EBITDA".
4.  **Interaction:** Confirm "Lucro Bruto" is not clickable or expandable (no caret).

---

Apply these precise changes to `pnl-matrix/lib/pnlLogic.ts`, and the "Lucro Bruto" row will be correctly calculated, positioned, and styled.
