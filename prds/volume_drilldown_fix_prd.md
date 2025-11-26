# PRD: Fix Volume Drilldown & Restore Generic Familia/Produto Breakdown

## Overview
The volume rows (`1_volumes`, `2_volumes`) were not appearing, and generic Familia/Produto drills stopped working. We need to:

1. Include volume nodes in the P&L output.
2. Add volume‐specific subrow logic in getSubRows.
3. Restore the original generic breakdown fetch logic in the expander onClick.

---

## 1. Backend: Include Volume Nodes in Final PnL

File: `lib/pnlLogic.ts`

```diff
 export async function buildPnl(year: number): Promise<PnLNode[]> {
-  const rawRevenue = await pivotRevenueLines(year);
+  const rawRevenue = await pivotRevenueLines(year);
+  // insert volume nodes immediately after Gross Revenue and Returns
+  const empty = emptyYear(year);
+  const volRev: PnLNode = { id: '1_volumes', label: 'Volumes (Receita)', values: empty, kind: 'volume_parent' };
+  const volRet: PnLNode = { id: '2_volumes', label: 'Volumes (Devolucoes)', values: empty, kind: 'volume_parent' };
+  const revenueLines = rawRevenue.flatMap(n => {
+    if (n.id === '1') return [n, volRev];
+    if (n.id === '2') return [n, volRet];
+    return [n];
+  });
   const cogsLines = await pivotCogsLines(year);
   const expenseLines = await pivotDespesas(year);

   const months = Object.keys(emptyYear(year)) as Month[];
   const nodes: Record<string, PnLNode> = {};
-  [...pivotRevenueLines(year), ...cogsLines].forEach(n => { nodes[n.id] = n; });
+  [...revenueLines, ...cogsLines].forEach(n => { nodes[n.id] = n; });

   // ... buildIntermediateRows, detailPercRowsMap, etc ...

   const finalPnlRows: (PnLNode | undefined)[] = [
-    nodes['1'],
-    nodes['2'],
+    nodes['1'],
+    nodes['1_volumes'],
+    nodes['2'],
+    nodes['2_volumes'],

     taxRootNode,
     ...(taxRootNode ? [getDetailPerc(taxRootNode.id)] : []),
     ...taxChildren,
     // ... rest of the array unchanged ...
   ];

   return finalPnlRows.filter(Boolean) as PnLNode[];
 }
 ```

---

## 2. Frontend: Add Volume Subrows & Restore Generic Drilldowns

File: `components/PnLTable.tsx`

### 2.1 Add Volume Subrows in `getSubRows`

Locate `getSubRows = (n: Node) => {` and insert **before** the top-level branch:

```diff
 const getSubRows = (n: Node) => {
   const cacheKey = `${n.id}_${year}`;

+  // Volume parent → show Familia & Produto breakdown
+  if (['1_volumes','2_volumes'].includes(n.id)) {
+    return [
+      { id: `${n.id}_breakdown_familia`, parentId: n.id, label: 'Familia', kind: 'breakdown', values: {} as Record<Month,number> },
+      { id: `${n.id}_breakdown_produto`, parentId: n.id, label: 'Produto',   kind: 'breakdown', values: {} as Record<Month,number> }
+    ];
+  }

   // 1) Top-level → two intermediates
   if (['1','2','5','7','8','9','10'].includes(n.id)) {
     return [ /* existing code */ ];
   }
```

### 2.2 Restore Generic Breakdown Logic in Expander `onClick`

Find the `id === 'expander'` column definition, and inside its `onClick={async () => { ... }}` add **after** the volume‐specific blocks:

```diff
 // ... inside the expander button's onClick:
 // 1) Top‐level: no fetch for volume parents
 if (['1','1_volumes','2','2_volumes','5','7','8','9','10'].includes(id)) return;

 // Volume Familia breakdown (volumes only)
 if (id.endsWith('_breakdown_familia') && id.includes('_volumes')) {
   /* existing volume fetch */
   return;
 }
 // Volume Produto breakdown (volumes only)
 if (id.endsWith('_breakdown_produto') && id.includes('_volumes')) {
   /* existing volume fetch */
   return;
 }
+// ===== Restore original generic Familia breakdown =====
+if (id.endsWith('_breakdown_familia') && !id.includes('_volumes') && !familyData[cacheKey] && !loadingMap[cacheKey]) {
+  const parent = id.replace('_breakdown_familia','');
+  let endpoint = '/api/cogs-details';
+  let apiKind = ({ '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' } as Record<string,string>)[parent] || '';
+  if (['1','2','5'].includes(parent)) {
+    endpoint = '/api/nfe-details';
+    apiKind = ({ '1':'ReceitaBruta','2':'Devolucao','5':'Desconto' } as Record<string,string>)[parent] || '';
+  }
+  setLoadingMap(p => ({ ...p, [cacheKey]: true }));
+  try {
+    const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=family`);
+    const rows = await res.json() as FamilyApiRow[];
+    setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }));
+    setDataVersion(v => v + 1);
+  } finally { setLoadingMap(p => ({ ...p, [cacheKey]: false })); }
+  return;
+}
+// ===== Restore original generic Produto breakdown =====
+if (id.endsWith('_breakdown_produto') && !id.includes('_volumes') && !productData[cacheKey] && !loadingProdMap[cacheKey]) {
+  const parent = id.replace('_breakdown_produto','');
+  let endpoint = '/api/cogs-details';
+  let apiKind = ({ '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' } as Record<string,string>)[parent] || '';
+  if (['1','2','5'].includes(parent)) {
+    endpoint = '/api/nfe-details';
+    apiKind = ({ '1':'ReceitaBruta','2':'Devolucao','5':'Desconto' } as Record<string,string>)[parent] || '';
+  }
+  setLoadingProdMap(p => ({ ...p, [cacheKey]: true }));
+  try {
+    const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=product`);
+    const rows = await res.json() as ProductApiRow[];
+    setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }));
+    setDataVersion(v => v + 1);
+  } finally { setLoadingProdMap(p => ({ ...p, [cacheKey]: false })); }
+  return;
+}
```

### 2.3 Verify `getRowCanExpand` is unchanged (includes volume parents)

No changes needed, but confirm:

```js
getRowCanExpand: (r) =>
  ['1','1_volumes','2','2_volumes','5','7','8','9','10'].includes(r.original.id)
  || r.original.id.endsWith('_breakdown_familia')
  || r.original.id.endsWith('_breakdown_produto')
  || ...
```

---

## 3. Test & Verify

1. `/api/pnl?year=2025` now returns `1_volumes` & `2_volumes` in correct order.
2. UI shows "Volumes (Receita)" under "1" and "Volumes (Devolucoes)" under "2".
3. Expanding volume parents yields Familia/Produto breakdown.
4. Expanding generic breakdowns for other categories (e.g., CPV, Descontos) triggers their respective `/api/cogs-details` or `/api/nfe-details` calls again.
5. All styling and row‐level formatting remain consistent.
6. Confirm no regressions in existing drilldown logic. 