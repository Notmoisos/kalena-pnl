# PRD: Subtract “Devoluções / Returns” from “Receita Bruta / Gross Revenue”

## 🧐 Context & Goal

Right now, **Receita Bruta** (node `1`) shows pure gross sales, and **Receita Líquida** (node `6`) subtracts Returns *again*. We want to:

1. Make node `1` equal **Gross – Returns**.
2. Stop subtracting Returns in the Net‐Revenue formula so we don’t double‐count.
3. Let all “% of Gross” rows (margins, detail percentages) use this *adjusted* gross.

---

## 📂 Affected File

- **`pnl-matrix/lib/pnlLogic.ts`**

---

## 🛠 Step‐by‐Step Code Changes

### 1. Locate `pivotRevenueLines`

Open:

```bash
pnl-matrix/lib/pnlLogic.ts
```

Find the function signature around line 147:

```ts
export async function pivotRevenueLines(year:number):Promise<PnLNode[]> {
  const raw = await fetchRevenueAggregates(year);
  const months = Object.keys(emptyYear(year)) as Month[];

  const nodes:{[k:string]:PnLNode} = {
    '1': { id:'1', label:'Receita Bruta / Gross Revenue', sign:'+', values: emptyYear(year) },
    '2': { id:'2', label:'Devoluções / Returns',     sign:'-', values: emptyYear(year) },
    '5': { id:'5', label:'Descontos Financeiros',      sign:'-', values: emptyYear(year) },
  };

  // ① Populate gross, returns, discounts
  raw.forEach(r => {
    const m = r.Periodo as Month;
    const id = r.kind==='ReceitaBruta' ? '1'
             : r.kind==='Devolucao'    ? '2'
             : '5';
    nodes[id].values[m] += r.valor;
  });

  // …then tax nodes, net, etc…
}
```

---

### 2. **Subtract Returns from Gross** immediately after the `raw.forEach`

Insert **before** the tax‐tree lines:

```diff
   raw.forEach(r => {
     // …existing code…
   });

+  // ————————————————————————————————————————
+  // Subtract Returns from Gross Revenue
+  // so that node '1' = Gross Sales – Returns
+  months.forEach(m => {
+    nodes['1'].values[m] -= nodes['2'].values[m];
+  });
+  // ————————————————————————————————————————
```

---

### 3. Remove returns from the Net‐Revenue formula

Still in `pivotRevenueLines`, locate the “net” block, e.g.:

```ts
  const taxRoot = revenueTaxNodes.find(n => n.id==='tax3')!;
  const net: PnLNode = {
    id: '6', label: 'Receita Líquida / Net Revenue', sign: '+', values: emptyYear(year)
  };

  months.forEach(m => {
-   net.values[m] = nodes['1'].values[m]
-                 - nodes['2'].values[m]
-                 - taxRoot.values[m]
-                 - nodes['5'].values[m];
+   // since we already removed ‘2’ from ‘1’, don’t subtract again
+   net.values[m] = nodes['1'].values[m]
+                 - taxRoot.values[m]
+                 - nodes['5'].values[m];
  });

  net.kind = 'intermediate';
  net.className = 'bg-blue-900 text-white';
```

---

### 4. Verify “% of Gross” logic remains correct

All percentage rows (margins, drill-down percentages) pull from **`nodes['1'].values`** automatically. No further edits needed there—once gross is net-of-returns, every division will use the updated value.

---

## ✅ After Applying

- **Receita Bruta** now equals _Gross Sales minus Returns_.  
- **Receita Líquida** subtracts only taxes & discounts (no double‐subtract).  
- All margin and detail‐percentage rows recalculate off the adjusted gross.  
- Run `pnpm dev` (or your existing hot‐reload) and confirm in the P&L UI that:
  - Node 1 number = GrossSales – Returns  
  - Node 6 number = (Node 1) – Taxes – Discounts  
  - % rows update accordingly  

Feel free to ping if anything needs clarification!