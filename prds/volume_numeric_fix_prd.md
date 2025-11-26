# PRD: Volume Numeric Formatting & Remove %-of-Gross Rows

## Objective
Ensure volume breakdown data:
1. Does **not** include the generated "%-of-Gross" rows under volume families.
2. Renders values as plain numbers (not BRL currency):
   - Rounded to two decimals.
   - If `.00`, display as integer (no decimal point).

All other P&L rows and drilldowns remain unchanged.

---

## 1. Exclude %-of-Gross Rows under Volume Families

File: `components/PnLTable.tsx`

Locate the **Familia** breakdown block in `getSubRows`:

```diff
 const getSubRows = (n: Node) => {
   const cacheKey = `${n.id}_${year}`;

   // Volume parent → show Familia & Produto breakdown
   if (['1_volumes','2_volumes'].includes(n.id)) {
     return [ /* ... */ ];
   }

   // 1) Top-level → two intermediates
   if (['1','2','5','7','8','9','10'].includes(n.id)) {
     return [
       { id:`${n.id}_breakdown_familia`, parentId:n.id, label:'Familia', kind:'breakdown', values:{} as Record<Month,number> },
       { id:`${n.id}_breakdown_produto`, parentId:n.id, label:'Produto', kind:'breakdown', values:{} as Record<Month,number> }
     ];
   }

   // 2) "Familia" ► pivot families (+ %-of-Gross)
   if (n.id.endsWith('_breakdown_familia')) {
+    const fams = familyData[cacheKey] ?? [];
+    // a) For volume parent breakdown, show only families (no % rows)
+    if (n.parentId?.endsWith('_volumes')) {
+      return fams;
+    }
+    // b) Existing behavior: revenue/returns/discount get families only
+    if (['1','2','5'].includes(n.parentId ?? '')) {
+      return fams;
+    }
+    // c) All others: interleave %-of-Gross
+    const gross = data.find(d => d.id==='1');
+    if (!gross) return fams;
+    return fams.flatMap(fam => {
+      const pct = /* ... existing logic ... */ Object.fromEntries(months.map(m=>[
+        m, gross.values[m] ? (fam.values[m]/gross.values[m])*100 : 0
+      ])) as Record<Month,number>;;
+      return [ fam, { id:`${fam.id}_percGross`, parentId:fam.parentId, label:'', kind:'detailPercentage', values:pct } as Node ];
+    });
   }

   // 3) "Produto" breakdown: show only product rows (no %-of-Gross)
   if (n.id.endsWith('_breakdown_produto')) {
     // unchanged
   }

   // …
 };
```

> This ensures that under `1_volumes_breakdown_familia` and `2_volumes_breakdown_familia`, **only** raw family rows appear.

---

## 2. Numeric Formatting for Volume Breakdown Values

File: `components/PnLTable.tsx`

Within the month‐column cell renderer (`cell: ({ row }) => { ... }` under `monthCols`), add a special case **before** currency formatting:

```diff
   cell: ({ row }: { row: any }) => {
     // Hide parent volumes row (no values)
     if (row.original.kind === 'volume_parent') {
       return <span />;
     }

     // Hide intermediate breakdown rows
     if (row.original.kind === 'breakdown') {
       return <span />;
     }

    const v = row.original.values[m] || 0;
    // Volume breakdown rows (families or products under volume sections): format as plain number
    // ParentID will be something like '1_volumes_breakdown_familia' or '2_volumes_breakdown_produto'
    // Both pivotFamilies and pivotProducts currently set kind: 'family' for their output rows.
    if (row.original.parentId?.includes('_volumes_breakdown_') && row.original.kind === 'family') {
      // integer or two decimals
      const text = Number.isInteger(v) ? `${v}` : v.toFixed(2);
      return <span className="text-right w-full">{text}</span>;
    }

    // Existing %‐of‐Gross and currency logic:
    const value = row.original.kind === 'percentage' || row.original.kind === 'detailPercentage'
      ? Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v / 100)
      : fmt(v);

    // ... remainder of cell logic unchanged ...
```

> This renders volume‐family (and volume‐product) cells as plain numbers, rounding/trimming as required.

---

## 3. Manual Verification

1. Refresh table: ensure "Volumes (Receita)" and "Volumes (Devolucoes)" appear, with no percent rows beneath their family breakdown.
2. Expand a volume parent:
   - See exactly two intermediates: "Familia" and "Produto".
   - No %-of-Gross row under the family rows when you expand the "Familia" intermediate of a Volume parent.
3. Expand the "Familia" intermediate under a **Volume Parent** (e.g. under "Volumes (Receita)"):
   - Families appear with numeric values (e.g. `123.45` or `678`), not currency.
4. Expand the "Produto" intermediate under a **Volume Parent**:
   - Products appear with numeric values (formatted same as families), not currency.
5. All other generic Familia/Produto drills (under non-volume categories like COGS, regular Revenue, etc.) retain their %-of-Gross rows (for Familia) and currency formatting for all their detail rows.
6. Confirm no unexpected regressions elsewhere.  

---

Once confirmed, commit these changes to finalize the volume drilldown formatting.  