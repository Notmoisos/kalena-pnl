
# PRD: Insert “% of Gross” Under Each Product‐Family in CPV Groups

## 🧐 Context & Goal

When you expand any **COGS** group—  
- **CPV** (`id='7'`)  
- **CPV Bonificações e Amostras** (`id='8'`)  
- **Perdas e Descartes** (`id='9'`)  

—you see a list of *family* rows (green background via `kind='family'`). We need to insert, immediately **below each family**, an italicized “% of Gross Revenue” row showing:

```
familyValue / ReceitaBruta (node '1') * 100
```

And **both** the family and its new %‐row must share the same greenish `bg-emerald-50` background. Other sections (taxes, discounts, expense subgroups) remain unchanged.

---

## 📂 Affected File

- **`pnl-matrix/components/PnLTable.tsx`**

---

## 🛠 Step‐by‐Step Code Changes

### 1. Extend `getSubRows` to interleave CPV family percentages

Find `getSubRows` (around line 240) and **before** the block that handles IDs `['1','2','5','10']`, insert:

```diff
 const getSubRows = (n: Node) => {
-  const cacheKey = `${n.id}_${year}`;
+  const cacheKey = `${n.id}_${year}`;

+  // ─── For CPV groups (7,8,9), interleave each family with a % of Gross row
+  if (['7','8','9'].includes(n.id)) {
+    // show loading placeholder
+    if (loadingMap[cacheKey]) {
+      return [{
+        id: `loading_${cacheKey}`,
+        parentId: n.id,
+        label: 'Carregando…',
+        values: {} as Record<Month,number>,
+        kind: 'loading'
+      } as Node];
+    }
+    // fetch the family rows already pivoted
+    const families = familyData[cacheKey] ?? [];
+    // find Receita Bruta node
+    const gross = data.find(d => d.id === '1');
+    if (!gross) return families;
+
+    // interleave: [ fam, fam% , fam2, fam2%, … ]
+    return families.flatMap(fam => {
+      const pctValues = Object.fromEntries(
+        months.map(m => [
+          m,
+          gross.values[m] !== 0
+            ? (fam.values[m] / gross.values[m]) * 100
+            : 0
+        ])
+      ) as Record<Month,number>;
+
+      const pctNode: Node = {
+        id: `${fam.id}_percGross`,
+        parentId: fam.parentId,
+        label: '',
+        kind: 'detailPercentage',
+        values: pctValues
+      };
+      return [fam, pctNode];
+    });
+  }
+  // ───────────────────────────────────────────────────────────────────
```

Leave the remaining expansion logic (taxes, discounts, "2.07 + Operacionais", CPV Devoluções, generic childMap) unchanged.

---

### 2. Update row–background logic to style family %-rows green

Locate the `<tr>` in the render loop (around line 296) and modify its `clsx`:

```diff
   <tr
     key={row.id}
     className={clsx(
       'border-b last:border-0',
-      row.original.kind === 'family'  && 'bg-emerald-50',
+      // green for family rows AND their %-of-gross siblings
+      (row.original.kind === 'family'
+        || (row.original.kind === 'detailPercentage' && row.original.id.includes('_fam_')))
+        && 'bg-emerald-50',
       row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
       (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white',
-      row.original.kind === 'detailPercentage' && row.depth > 0 && 'bg-[#e3e6f1]',
+      // keep light-blue for other detailPercentages (e.g. under 2.07)
+      row.original.kind === 'detailPercentage'
+        && !row.original.id.includes('_fam_')
+        && row.depth > 0
+        && 'bg-[#e3e6f1]',
       !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]'
     )}
   >
```

- **`id.includes('_fam_')`** reliably identifies the new CPV‐family percentage rows, since `pivotFamilies` produces `fam_`‐prefixed IDs.
- We exclude these from the light-blue clause so they stay green.

---

## ✅ After Applying

1. Expand CPV groups `7`, `8`, or `9`.  
2. Each **family** row (green) is followed by an **italic %-of-Gross** row—also green.  
3. All existing behaviors (loading spinners, “2.07 + Operacionais” percentages, click‐to‐detail) remain intact.  
4. No changes to the back-end or data‐model; this is purely in the display layer.
