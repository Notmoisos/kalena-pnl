# PRD: Show “% of Gross” Below Each Sub‐Category under “2.07 + Operacionais”

## 🧐 Context & Goal

In the P&L table, when you expand the **Operacionais** group (`2.07 + Operacionais`), you currently see a list of its sub‐categories with their absolute values. We want to insert, immediately below each sub‐category row, a **percentage row** showing that sub‐category’s value as a percentage of **Receita Bruta / Gross Revenue** (node `1`). This enhancement applies **only** under the “2.07 + Operacionais” group and must not affect:

- Other expense groups
- The modal behavior when clicking on a sub‐category (Despesa details)

---

## 📂 Affected File

- `pnl-matrix/components/PnLTable.tsx`

---

## 🛠 Step-by-Step Changes

### 1. Locate the `getSubRows` function

Open  
``` 
pnl-matrix/components/PnLTable.tsx
```  
and find the `getSubRows` definition (around line 110):

```tsx
const getSubRows = (n: Node) => {
  const cacheKey = `${n.id}_${year}`;
  if (['1','2','5','7','8','9','10'].includes(n.id)) {
    // …existing tax/family logic…
  }
  return childMap[n.id] ?? [];
};
```

---

### 2. Intercept the “Operacionais” group

Insert a new branch at the top of `getSubRows` to detect the **Operacionais** group (its internal `id` is `grp_2.07 + Operacionais`) and interleave each sub‐category with a computed percentage row:

```diff
 const getSubRows = (n: Node) => {
+  // ────────────────────────────────────────────────────────────────────────
+  // For the “2.07 + Operacionais” group, insert a % of Gross row under each sub‐category
+  if (n.id === 'grp_2.07 + Operacionais') {
+    // get the raw sub‐categories
+    const subs = childMap[n.id] ?? [];
+    // find Gross Revenue node
+    const gross = data.find(d => d.id === '1');
+    if (!gross) return subs;
+
+    // interleave: [ sub1, sub1% , sub2, sub2%, … ]
+    return subs.flatMap(sub => {
+      // compute month‐by‐month % of Gross
+      const percValues = Object.fromEntries(
+        months.map(m => [
+          m,
+          gross.values[m] !== 0
+            ? (sub.values[m] / gross.values[m]) * 100
+            : 0
+        ])
+      ) as Record<Month, number>;
+
+      // build an inline percentage row
+      const percNode: Node = {
+        id: `${sub.id}_percGross`,
+        label: '',                     // no label, rendered italic
+        kind: 'detailPercentage',      // reuses existing styling
+        values: percValues
+      };
+
+      // return [ subcategory, percentage row ]
+      return [sub, percNode];
+    });
+  }
+  // ────────────────────────────────────────────────────────────────────────
   const cacheKey = `${n.id}_${year}`;
   if (['1','2','5','7','8','9','10'].includes(n.id)) {
     // …existing tax/family logic…
```

---

### 3. Verify CSS/styling behavior

- The new rows use `kind: 'detailPercentage'`, so they will be rendered in *italic* with no text (only the percentage).
- Indentation: because these rows come from `getSubRows`, they will be indented one level under the “2.07 + Operacionais” parent (same indent as sub‐categories).

---

## ✅ After Applying

1. Expand “2.07 + Operacionais” → you see for each sub‐category:  
   - **Sub‐category label** and its numeric value  
   - **Italic percentage row** showing (Sub‐category / Gross Revenue)  
2. Nothing changes for any other group or click behavior.  
3. Run your hot‐reload and confirm in the UI:

```
▶ 2.07 + Operacionais
    Subcat A          R$ 10.000,00
                      — 5.2%   ← new row
    Subcat B           R$ 5.000,00
                      — 2.6%   ← new row
    …
```

Feel free to adjust label/truncation or CSS if you need more space or a %-sign suffix.
