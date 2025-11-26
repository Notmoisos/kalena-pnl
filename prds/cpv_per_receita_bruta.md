
```markdown
# PRD: Show “% of Gross Revenue” for Top-Level COGS (CPV) Rows

## 🧐 Context & Goal

We already show detail-percentage rows for taxes, discounts and expense groups. Now we want the same “% of Gross Revenue” lines under each of the four **COGS** rows:

- **CPV** (`id = '7'`)  
- **CPV Bonificações e Amostras** (`id = '8'`)  
- **Perdas e Descartes** (`id = '9'`)  
- **CPV Devoluções** (`id = '10'`)  

These should appear **just below** each of those four top-level rows, calculated as:

```
COGS_value / Receita_Bruta_value * 100
```

---

## 📂 Affected File

- `pnl-matrix/lib/pnlLogic.ts`

---

## 🛠 Step-by-Step Changes

### 1. Add COGS groups to the detail-percentage factory

In **`buildDetailPercentageRows`** (around line 383), after the last `createAndStore(...)` for “2.02 + Tributárias”, append:

```diff
   // l. 2.02 + Tributárias
   createAndStore(findGroup('2.02 + Tributárias'));
+
+  // m. COGS / CPV groups
+  createAndStore(nodes['7']);   // CPV
+  createAndStore(nodes['8']);   // CPV Bonificações e Amostras
+  createAndStore(nodes['9']);   // Perdas e Descartes
+  createAndStore(nodes['10']);  // CPV Devoluções
```

This will populate `detailPercRowsMap` with entries for `7_percGross`, `8_percGross`, etc.

---

### 2. Interleave COGS detail-percent rows in the final P&L sequence

In **`buildPnl`** (around the section where you list `nodes['7']` to `nodes['10']`), change this block:

```diff
   // …after Receita Líquida and Margem…
   nodes['7'], nodes['8'], nodes['9'], nodes['10'],
-  opIncome, margemOpIncome,
+  // insert % of Gross after each COGS row
+  ...(nodes['7']  ? [getDetailPerc('7')]  : []),
+  ...(nodes['8']  ? [getDetailPerc('8')]  : []),
+  ...(nodes['9']  ? [getDetailPerc('9')]  : []),
+  ...(nodes['10'] ? [getDetailPerc('10')] : []),
+  opIncome, margemOpIncome,
```

This ensures:

```text
… 
CPV                       R$ 123.45
                          — 1.2%      ← new row (id '7_percGross')
CPV Bonificações…         R$  45.67
                          — 0.4%      ← new row (id '8_percGross')
Perdas e Descartes        R$  12.34
                          — 0.1%      ← new row (id '9_percGross')
CPV Devoluções            R$   5.67
                          — 0.0%      ← new row (id '10_percGross')
Receita Operacional …     R$ …
…
```

---

## ✅ After Applying

1. **Re‐build** or hot-reload your server.  
2. Visit the P&L page → expand nothing special, just scroll to the **COGS** section:  
   - Each of the four COGS rows now has a percentage line below it.  
   - They use the existing **detailPercentage** styling (italic + percent format).  
3. All other groups, sub-categories and click behaviors remain unchanged.

Feel free to adjust where in the sequence you insert these, or tweak CSS via the `detailPercentage` kind if needed.
