
```markdown
# PRD: Disable “% of Gross” Interleaving under Revenue, Returns & Discounts

## 🧐 Context & Goal

Right now our two‐level drilldown shows:

- **Top‐level** “Familia” / “Produto” → fetch and list rows  
- **Always** interleave a “% of Gross” row under each family/product  

We want to **keep** the two‐level drilldown, **but** for these specific top‐level IDs:

- **Receita Bruta** (`id='1'`)  
- **Devoluções** (`id='2'`)  
- **Descontos Financeiros** (`id='5'`)  

the **“Familia”** and **“Produto”** expansions should **not** include any “% of Gross” rows—just the raw family/product rows.

All other sections (COGS, “2.07 + Operacionais”, etc.) continue to interleave percentages.

---

## 📂 Affected File

- `pnl-matrix/components/PnLTable.tsx`

---

## 🛠 Step‐by‐Step Code Changes

### 1) Locate the `getSubRows` function

Open `pnl-matrix/components/PnLTable.tsx` and find the `getSubRows` definition. You’ll see blocks that look like:

```ts
// … before this …
if (n.id.endsWith('_breakdown_familia')) {
  if (loadingMap[cacheKey]) {
    return [{ /* loading node */ }];
  }
  const fams = familyData[cacheKey] ?? [];
  const gross = data.find(d => d.id==='1');
  if (!gross) return fams;
  return fams.flatMap(fam => {
    // … build pct row …
  });
}
```

And similarly for `_breakdown_produto`.

### 2) Wrap interleaving in a parent‐ID check

#### 2.1 “Familia” block

Replace the entire `_breakdown_familia` block with this:

```diff
   // 2) “Familia” ► pivot families (+ %-of-Gross)
-  if (n.id.endsWith('_breakdown_familia')) {
+  if (n.id.endsWith('_breakdown_familia')) {
     if (loadingMap[cacheKey]) {
       return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', kind:'loading', values:{} as Record<Month,number> } as Node];
     }
     const fams  = familyData[cacheKey] ?? [];
+    // If parent is Revenue/Returns/Discount, just show families (no % rows)
+    if (['1','2','5'].includes(n.parentId ?? '')) {
+      return fams;
+    }
     const gross = data.find(d => d.id==='1');
     if (!gross) return fams;
     return fams.flatMap(fam => {
       const pct = Object.fromEntries(months.map(m=>[
         m, gross.values[m] ? (fam.values[m]/gross.values[m])*100 : 0
       ])) as Record<Month,number>;
       return [
         fam,
-        { id:`${fam.id}_percGross`, parentId:fam.parentId, label:'', kind:'detailPercentage', values:pct } as Node
+        { id:`${fam.id}_percGross`, parentId:fam.parentId, label:'', kind:'detailPercentage', values:pct } as Node
       ];
     });
   }
```

#### 2.2 “Produto” block

Similarly, update the `_breakdown_produto` block:

```diff
   // 3) “Produto” ► pivot products (+ %-of-Gross)
-  if (n.id.endsWith('_breakdown_produto')) {
+  if (n.id.endsWith('_breakdown_produto')) {
     if (loadingProdMap[cacheKey]) {
       return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', kind:'loading', values:{} as Record<Month,number> } as Node];
     }
     const prods = productData[cacheKey] ?? [];
+    // If parent is Revenue/Returns/Discount, just show products (no % rows)
+    if (['1','2','5'].includes(n.parentId ?? '')) {
+      return prods;
+    }
     const gross = data.find(d => d.id==='1');
     if (!gross) return prods;
     return prods.flatMap(prod => {
       const pct = Object.fromEntries(months.map(m=>[
         m, gross.values[m] ? (prod.values[m]/gross.values[m])*100 : 0
       ])) as Record<Month,number>;
       return [
         prod,
-        { id:`${prod.id}_percGross`, parentId:prod.parentId, label:'', kind:'detailPercentage', values:pct } as Node
+        { id:`${prod.id}_percGross`, parentId:prod.parentId, label:'', kind:'detailPercentage', values:pct } as Node
       ];
     });
   }
```

### 3) Verify behavior

1. In **“Receita Bruta”**, **“Devoluções”**, **“Descontos”** expand → you get only **Familia** & **Produto** rows, with no percentage rows.
2. In **COGS** or **“2.07 + Operacionais”**, percentage rows remain unchanged.
3. No changes are needed in the API routes or elsewhere.

---

## ✅ After Applying

- **Revenue, Returns, Discounts**: “Familia” & “Produto” expansions show raw rows only.  
- **Other sections**: continue to show interleaved “% of Gross” rows.  
- All existing click‐to‐detail, loading, and styling remain intact.

```
