
Read file: pnl-matrix/lib/pnlLogic.ts
Okay, I've investigated the codebase, primarily `pnl-matrix/lib/pnlLogic.ts`. The function `buildIntermediateRows` is where existing intermediate and percentage rows are calculated and defined. The `buildPnl` function then assembles all rows in the correct order.

Here's the PRD to add the four new percentage rows:

# PRD: Add New Percentage-Based Margin Rows

**Objective:** Introduce four new rows to the P&L table, all of `kind: 'percentage'`, to display various margins. These rows should have the same blue background and white text styling as other intermediate/percentage rows.

**New Rows & Calculations:**

1.  **Margem % Receita Operacional / Margin %**
    *   ID: `margemOpIncome`
    *   Calculation: `(Receita Operacional / Operating Income) / (Receita Bruta / Gross Revenue)`
    *   Location: Below "Receita Operacional / Operating Income"
2.  **Margem % Lucro Bruto / Gross Profit %**
    *   ID: `margemLucroBruto`
    *   Calculation: `(Lucro Bruto / Gross Profit) / (Receita Bruta / Gross Revenue)`
    *   Location: Below "Lucro Bruto / Gross Profit"
3.  **Margem % EBITDA / Margin %**
    *   ID: `margemEbitda`
    *   Calculation: `(EBITDA) / (Receita Líquida / Net Revenue)`
    *   Location: Below "EBITDA"
4.  **Margem % Lucro Liquido / Margin %**
    *   ID: `margemNetProfit`
    *   Calculation: `(Lucro Líquido / Net Profit) / (Receita Líquida / Net Revenue)`
    *   Location: Below "Lucro Líquido / Net Profit"

---

## 1. File & High-Level Impact

| File                      | Purpose                                                                 |
| :------------------------ | :---------------------------------------------------------------------- |
| `lib/pnlLogic.ts`         | Define and calculate the new percentage rows in `buildIntermediateRows`, and add them to the final P&L structure in `buildPnl`. |
| `components/PnLTable.tsx` | No changes needed if the previous fix for `kind: 'percentage'` styling is in place. |

---

## 2. Detailed Changes

### Step 2.1: Update `buildIntermediateRows` in `lib/pnlLogic.ts`

**File:** `pnl-matrix/lib/pnlLogic.ts`

**Change:**
1.  Modify the return type of `buildIntermediateRows` to include the new margin rows.
2.  Define and calculate the four new `PnLNode` objects for these percentages.
3.  Return them along with the existing intermediate rows.

```ts
// pnl-matrix/lib/pnlLogic.ts

export function buildIntermediateRows(
  nodes: Record<string, PnLNode>,
  groups: Record<string, PnLNode>, // groups is not used by new rows but kept for existing
  months: Month[]
): {
  margem: PnLNode;
  opIncome: PnLNode;
  lucroBruto: PnLNode;
  ebitda: PnLNode;
  netProfit: PnLNode;
+ margemOpIncome: PnLNode; // ADDED
+ margemLucroBruto: PnLNode; // ADDED
+ margemEbitda: PnLNode; // ADDED
+ margemNetProfit: PnLNode; // ADDED
} {
  const yearForEmpty = months[0].slice(0, 4) as unknown as number;

  // Existing 'margem' (Margem % Receita Líquida)
  const margem: PnLNode = {
    id: 'margem',
    label: 'Margem % Receita Líquida',
    kind: 'percentage',
    className: 'bg-blue-900 text-white',
    values: emptyYear(yearForEmpty)
  };
  months.forEach(m => {
    const receitaBruta = nodes['1']?.values[m]; // Receita Bruta
    const receitaLiquida = nodes['6']?.values[m]; // Receita Líquida
    margem.values[m] = (receitaBruta && receitaBruta !== 0) ? (receitaLiquida / receitaBruta) * 100 : 0;
  });

  // Existing 'opIncome'
  const opIncome: PnLNode = {
    id: 'op',
    label: 'Receita Operacional / Operating Income',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(yearForEmpty)
  };
  months.forEach(m => {
    opIncome.values[m] = (nodes['6']?.values[m] || 0) // Net Revenue
      - (nodes['7']?.values[m] || 0)  // CPV
      - (nodes['8']?.values[m] || 0)  // CPV Boni
      - (nodes['9']?.values[m] || 0)  // Perdas
      + (nodes['10']?.values[m] || 0); // CPV Devol
  });

+ // ADDED: Margem % Receita Operacional
+ const margemOpIncome: PnLNode = {
+   id: 'margemOpIncome',
+   label: 'Margem % Receita Operacional',
+   kind: 'percentage',
+   className: 'bg-blue-900 text-white',
+   values: emptyYear(yearForEmpty)
+ };
+ months.forEach(m => {
+   const receitaBruta = nodes['1']?.values[m]; // Receita Bruta
+   margemOpIncome.values[m] = (receitaBruta && receitaBruta !== 0) ? (opIncome.values[m] / receitaBruta) * 100 : 0;
+ });

  // Existing 'lucroBruto'
  const lucroBruto: PnLNode = {
    id: 'lucroBruto',
    label: 'Lucro Bruto / Gross Profit',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(yearForEmpty)
  };
  months.forEach(m => {
    lucroBruto.values[m] = opIncome.values[m] - (groups['grp_2.07 + Operacionais']?.values[m] || 0);
  });

+ // ADDED: Margem % Lucro Bruto
+ const margemLucroBruto: PnLNode = {
+   id: 'margemLucroBruto',
+   label: 'Margem % Lucro Bruto',
+   kind: 'percentage',
+   className: 'bg-blue-900 text-white',
+   values: emptyYear(yearForEmpty)
+ };
+ months.forEach(m => {
+   const receitaBruta = nodes['1']?.values[m]; // Receita Bruta
+   margemLucroBruto.values[m] = (receitaBruta && receitaBruta !== 0) ? (lucroBruto.values[m] / receitaBruta) * 100 : 0;
+ });

  // Existing 'ebitda'
  const ebitda: PnLNode = {
    id: 'ebitda',
    label: 'EBITDA',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(yearForEmpty)
  };
  months.forEach(m => {
    ebitda.values[m] = opIncome.values[m]
      - (groups['grp_2.01 + Importação']?.values[m] || 0)
      // ... other expense groups ...
      - (groups['grp_2.09 + Serviços tomados']?.values[m] || 0);
  });

+ // ADDED: Margem % EBITDA
+ const margemEbitda: PnLNode = {
+   id: 'margemEbitda',
+   label: 'Margem % EBITDA',
+   kind: 'percentage',
+   className: 'bg-blue-900 text-white',
+   values: emptyYear(yearForEmpty)
+ };
+ months.forEach(m => {
+   const receitaLiquida = nodes['6']?.values[m]; // Receita Líquida
+   margemEbitda.values[m] = (receitaLiquida && receitaLiquida !== 0) ? (ebitda.values[m] / receitaLiquida) * 100 : 0;
+ });

  // Existing 'netProfit'
  const netProfit: PnLNode = {
    id: 'netprofit',
    label: 'Lucro Líquido / Net Profit',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(yearForEmpty)
  };
  months.forEach(m => {
    netProfit.values[m] = ebitda.values[m]
      - (groups['grp_2.06 + Financeiras']?.values[m] || 0)
      - (groups['grp_2.02 + Tributárias']?.values[m] || 0);
  });

+ // ADDED: Margem % Lucro Liquido
+ const margemNetProfit: PnLNode = {
+   id: 'margemNetProfit',
+   label: 'Margem % Lucro Liquido',
+   kind: 'percentage',
+   className: 'bg-blue-900 text-white',
+   values: emptyYear(yearForEmpty)
+ };
+ months.forEach(m => {
+   const receitaLiquida = nodes['6']?.values[m]; // Receita Líquida
+   margemNetProfit.values[m] = (receitaLiquida && receitaLiquida !== 0) ? (netProfit.values[m] / receitaLiquida) * 100 : 0;
+ });

  return {
    margem, opIncome, lucroBruto, ebitda, netProfit,
+   margemOpIncome, margemLucroBruto, margemEbitda, margemNetProfit // ADDED
  };
}
```
*Self-correction:* The original `margem` calculation was `(net / bruto) * 100`. It has been corrected to `(receitaLiquida / receitaBruta) * 100` which means `nodes['6'] / nodes['1']`. The PRD specified division by "Receita Bruta / Gross Revenue" (nodes['1']). I'll use `nodes['6']` (Net Revenue) as the denominator for consistency with how other high-level margins are often calculated, but this is a business logic detail that should be confirmed. For now, `margem` (the existing one) will be Net Rev / Gross Rev. The new `margemEbitda` and `margemNetProfit` will use Net Revenue as their denominator as per the PRD.

*Correction to my self-correction:* The initial "Margem % Receita Líquida" is defined as `nodes['6'] / nodes['1']` (Net Revenue / Gross Revenue). The original calculation `margem.values[m] = bruto ? (net / bruto) * 100 : 0;` correctly implements this. The PRD for the new rows specified:
    *   EBITDA % -> EBITDA / Net Revenue (nodes['6'])
    *   Net Profit % -> Net Profit / Net Revenue (nodes['6'])
This will be followed.

### Step 2.2: Update `buildPnl` in `lib/pnlLogic.ts`

**File:** `pnl-matrix/lib/pnlLogic.ts`

**Change:** Destructure the new margin rows from the result of `buildIntermediateRows` and insert them into the final P&L array at their correct positions.

```ts
// pnl-matrix/lib/pnlLogic.ts

export async function buildPnl(year: number): Promise<PnLNode[]> {
  // ... (fetch revenueLines, cogsLines, expenseLines) ...
  // ... (build nodes, groups, months) ...

  const {
    margem, opIncome, lucroBruto, ebitda, netProfit,
+   margemOpIncome, margemLucroBruto, margemEbitda, margemNetProfit // ADDED
  } = buildIntermediateRows(nodes, groups, months);

  // ... (find tax roots and children, expense group ordering) ...

  // Final array - insert new margin rows
  return [
    nodes['1'], nodes['2'], taxRoot, ...taxChildren, stRoot, ...stChildren, nodes['5'], // Revenue section
    nodes['6'], margem,                                                              // Net Revenue & its margin
    nodes['7'], nodes['8'], nodes['9'], nodes['10'],                                     // COGS section
    opIncome, margemOpIncome, // ADDED margemOpIncome
    ...(op ? [op] : []), // Other operational expenses
    lucroBruto, margemLucroBruto, // ADDED margemLucroBruto
    ...(imp ? [imp] : []), // Import expenses
    ...mainGroups, // Main expense groups
    ebitda, margemEbitda, // ADDED margemEbitda
    ...(fin6 ? [fin6] : []), // Financial expenses
    ...(fin2 ? [fin2] : []), // Tax expenses
    netProfit, margemNetProfit, // ADDED margemNetProfit
    ...(other ? [other] : []), // Other expenses (Desconsiderados)
    ...subExpenses
  ];
}
```

---

## 3. Validation Checklist

1.  Load the P&L table.
2.  Verify the four new percentage rows appear in the correct locations:
    *   "Margem % Receita Operacional" below "Receita Operacional / Operating Income".
    *   "Margem % Lucro Bruto" below "Lucro Bruto / Gross Profit".
    *   "Margem % EBITDA" below "EBITDA".
    *   "Margem % Lucro Liquido" below "Lucro Líquido / Net Profit".
3.  Verify the calculations for each new percentage row are correct based on the specified formulas for a few sample months.
4.  Verify all new percentage rows have the blue background and white text styling.
5.  Verify that the existing "Margem % Receita Líquida" row calculation and styling are unchanged and correct.
6.  Verify all other rows and functionalities (drill-downs, modals) are unaffected.

---

### ✅ This PRD outlines the necessary changes to introduce the new percentage-based margin rows. Ensure the division denominators (Receita Bruta vs. Receita Líquida) are confirmed against business requirements if there's any ambiguity.


### o4-mini comments


Ran tool

Read file: pnl-matrix/lib/pnlLogic.ts
The PRD as-written hits all of the right touch-points. In particular:

1. You’ve extended `buildIntermediateRows`  
   - Updated its return signature to include the four new `percentage` nodes.  
   - Defined each node with the correct `id`, `label`, `kind: 'percentage'`, `className`, and month-by-month calculation (OpIncome÷Bruta, LucroBruto÷Bruta, EBITDA÷Liquida, NetProfit÷Liquida).  
2. You’ve updated `buildPnl`  
   - Destructured the four new margins out of `buildIntermediateRows`.  
   - Inserted each margin immediately below its parent row in the final array.  
3. Styling & behavior  
   - All new rows carry `className: 'bg-blue-900 text-white'`.  
   - You’ve already expanded the table’s clsx rule to treat `kind==='percentage'` exactly like `intermediate`, so no further UI tweaks are needed.  
4. Validation steps are solid—you’ll check placement, formulas against sample months, styling, and verify nothing else regressed.

Only minor tweak I’d suggest: in the PRD’s “New Rows & Calculations” section the first formula reads  
```
(Receita Operacional / Operating Income) / (Receita Bruta / Gross Revenue)
```  
which can be mis-read as a division of two fractions. I’d simplify it to  
“Operating Income ÷ Gross Revenue.”  

Beyond that phrasing nitpick, the PRD is complete and correct.
