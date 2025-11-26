
Okay, this is an interesting new set of requirements! We'll be adding percentage rows that show each parent row's contribution to Gross Revenue, with unique styling (italic, default colors, blank label).

Before I generate the PRD, I have one clarification:
You've listed:
g. below 2.05 + Marketing / Comercial
h. below 2.05 + Marketing / Comercial

Is this intentional, meaning you want two identical percentage rows below "2.05 + Marketing / Comercial", or is item 'h' a typo? Assuming it's a typo for now, I'll plan for 11 new percentage rows. If you indeed need two, let me know!

I'll investigate the codebase to formulate the PRD. This will involve checking how rows are structured and styled.


Read file: pnl-matrix/lib/pnlLogic.ts

Read file: pnl-matrix/components/PnLTable.tsx
Okay, I've reviewed the relevant files. Here's the PRD for creating these new "percentage of Gross Revenue" rows. I'm proceeding with the assumption that item 'h' in your list was a duplicate of 'g', so this PRD covers 11 new rows.

# PRD: Add Percentage of Gross Revenue Rows with Unique Styling

**Objective:** Introduce 11 new percentage rows to the P&L table. Each new row will display its parent row's value as a percentage of "Receita Bruta / Gross Revenue". These rows will have a blank label, italic text, default text/background color, and their values will not be bold.

**New Rows & Parent Rows:**

The new percentage rows will appear directly below their respective parent rows:
1.  Parent: "Impostos sobre receita" (ID: `tax3`)
2.  Parent: "Descontos Financeiros" (ID: `5`)
3.  Parent: "2.07 + Operacionais" (ID `op` from `getGroup('2.07 + Operacionais')`)
4.  Parent: "2.01 + Importação" (ID `imp` from `getGroup('2.01 + Importação')`)
5.  Parent: "2.03 + Despesas com Pessoal" (Group fetched via `getGroup` then filtered in `mainGroups`)
6.  Parent: "2.04 + Gerais e administrativas" (Group fetched via `getGroup` then filtered in `mainGroups`)
7.  Parent: "2.05 + Marketing / Comercial" (Group fetched via `getGroup` then filtered in `mainGroups`)
8.  Parent: "2.08 + Trade Marketing" (Group fetched via `getGroup` then filtered in `mainGroups`)
9.  Parent: "2.09 + Serviços tomados" (Group fetched via `getGroup` then filtered in `mainGroups`)
10. Parent: "2.06 + Financeiras" (ID `fin6` from `getGroup('2.06 + Financeiras')`)
11. Parent: "2.02 + Tributárias" (ID `fin2` from `getGroup('2.02 + Tributárias')`)

**Calculation:** `(Parent Row Value for Month / Receita Bruta Value for Month) * 100`

---

## 1. File & High-Level Impact

| File                               | Purpose                                                                                                                               |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `pnl-matrix/lib/pnlLogic.ts`         | Define a new `PnLNode.kind` (`'parent_percentage'`). Create, calculate, and insert the 11 new percentage nodes into the P&L structure in `buildPnl`. |
| `pnl-matrix/components/PnLTable.tsx` | Add styling rules for `kind: 'parent_percentage'` (italic text, default colors). Update value rendering and bolding logic to accommodate the new kind. |

---

## 2. Detailed Changes

### Step 2.1: Update `PnLNode` type in `lib/pnlLogic.ts`

**File:** `pnl-matrix/lib/pnlLogic.ts`

**Change:** Add `'parent_percentage'` to the `PnLNode.kind` type.

```ts
// pnl-matrix/lib/pnlLogic.ts
// ...
export type PnLNode = {
  // ... existing fields
  kind?: 'intermediate' | 'percentage' | 'family' | 'loading' | 'parent_percentage'; // ADDED 'parent_percentage'
  // ... existing fields
};
// ...
```

### Step 2.2: Define and Insert New Percentage Rows in `buildPnl` in `lib/pnlLogic.ts`

**File:** `pnl-matrix/lib/pnlLogic.ts`

**Change:**
1.  Inside `buildPnl`, after all primary nodes (`nodes`, `groups`, `taxRoot`, etc.) are defined and fetched, create a helper function or directly map over the parent nodes to generate these new percentage rows.
2.  For each parent, create a new `PnLNode` with:
    *   `id`: e.g., `pp_tax3` (for "parent percentage of tax3")
    *   `label`: `''` (empty string)
    *   `kind`: `'parent_percentage'`
    *   `values`: Calculated as `(parentNode.values[m] / nodes['1'].values[m]) * 100`. Handle potential division by zero.
3.  Insert each new percentage node directly after its corresponding parent node in the final array returned by `buildPnl`.

```ts
// pnl-matrix/lib/pnlLogic.ts

export async function buildPnl(year: number): Promise<PnLNode[]> {
  // ... (existing setup: revenueLines, cogsLines, expenseLines, nodes, groups, months, intermediate rows, taxRoots, specific group fetches like imp, fin6, fin2, op) ...

  const grossRevenueNode = nodes['1']; // Receita Bruta

  // Helper to create the new percentage rows
  const createParentPercentageNode = (parentNode: PnLNode | undefined, idSuffix: string): PnLNode | null => {
    if (!parentNode || !grossRevenueNode) return null;
    const newId = `pp_${idSuffix}`;
    const newValues: Record<Month, number> = emptyYear(year);
    months.forEach(m => {
      const parentValue = parentNode.values[m] || 0;
      const grossRevenueValue = grossRevenueNode.values[m] || 0;
      // Note: parentNode values for expenses are typically positive numbers, but represent deductions.
      // The percentage should reflect this relationship, usually shown as a positive percentage.
      // If parentRow.sign is '-', its values are positive.
      // If parent value is negative (e.g. a reversal), then this calculation will result in a negative percentage.
      // We take the absolute of parentValue if we always want positive percentages of Gross Revenue.
      // However, for items like 'Impostos', they reduce revenue, so their % of Gross Revenue might be better represented as positive.
      // Let's assume direct division for now, which means expense percentages will be negative if their values are negative in the PnLNode.
      // If expenses are stored as positive values with a '-' sign, the division will be positive.
      // The problem asks for value / Gross Revenue. Gross Revenue is positive.
      // Tax lines (like tax3) have sign: '-' but their values in PnLNode are positive.
      // Expense group nodes (like 'op', 'imp') also have sign: '-' and positive values.
      // 'Descontos Financeiros' (nodes['5']) also has sign: '-' and positive values.
      // So, parentValue will typically be positive.
      newValues[m] = grossRevenueValue !== 0 ? (parentValue / grossRevenueValue) * 100 : 0;
    });
    return {
      id: newId,
      label: '',
      kind: 'parent_percentage',
      values: newValues,
      // parentId: parentNode.id // Optional: for potential logical grouping if ever needed, but not for display hierarchy here
    };
  };

  // Create the new percentage rows
  const pp_tax3 = createParentPercentageNode(taxRoot, 'tax3');
  const pp_descontos = createParentPercentageNode(nodes['5'], 'descontos');
  const pp_op = createParentPercentageNode(op, 'op'); // for 2.07 + Operacionais
  const pp_imp = createParentPercentageNode(imp, 'imp'); // for 2.01 + Importação

  // For groups within mainGroups, we need to find them first
  const despesasPessoalGroup = mainGroups.find(g => g.label.includes('2.03 + Despesas com Pessoal'));
  const pp_despesasPessoal = createParentPercentageNode(despesasPessoalGroup, 'despesas_pessoal');

  const geraisAdminGroup = mainGroups.find(g => g.label.includes('2.04 + Gerais e administrativas'));
  const pp_geraisAdmin = createParentPercentageNode(geraisAdminGroup, 'gerais_admin');

  const marketingComercialGroup = mainGroups.find(g => g.label.includes('2.05 + Marketing / Comercial'));
  const pp_marketingComercial = createParentPercentageNode(marketingComercialGroup, 'marketing_comercial');

  const tradeMarketingGroup = mainGroups.find(g => g.label.includes('2.08 + Trade Marketing'));
  const pp_tradeMarketing = createParentPercentageNode(tradeMarketingGroup, 'trade_marketing');

  const servicosTomadosGroup = mainGroups.find(g => g.label.includes('2.09 + Serviços tomados'));
  const pp_servicosTomados = createParentPercentageNode(servicosTomadosGroup, 'servicos_tomados');

  const pp_fin6 = createParentPercentageNode(fin6, 'fin6'); // for 2.06 + Financeiras
  const pp_fin2 = createParentPercentageNode(fin2, 'fin2'); // for 2.02 + Tributárias


  // Build the final P&L array, inserting new rows
  const finalPnl: PnLNode[] = [];
  const pnlStructure = [
    // Revenue section
    nodes['1'], nodes['2'], taxRoot, ...(taxChildren || []), ...(pp_tax3 ? [pp_tax3] : []), // Add after taxRoot and its direct children. Or after taxRoot if taxChildren are not expanded by default
                                                                                            // The PRD says "below Impostos sobre receita", which is taxRoot.
                                                                                            // If taxChildren are always shown, it should be after them.
                                                                                            // Let's assume after taxRoot for now, as taxChildren might be collapsible.
                                                                                            // If taxRoot itself is not in the final array (only its children), then this needs rethinking.
                                                                                            // On review, taxRoot AND taxChildren are in the array. So after taxChildren.
    stRoot, ...(stChildren || []), nodes['5'], ...(pp_descontos ? [pp_descontos] : []),

    // Net Revenue & its margin
    nodes['6'], margem,

    // COGS section
    nodes['7'], nodes['8'], nodes['9'], nodes['10'],

    // Operating Income section
    opIncome, margemOpIncome,

    // Operational Expenses (2.07 + Operacionais)
    ...(op ? [op, ...(pp_op ? [pp_op] : [])] : []),

    lucroBruto, margemLucroBruto,

    // Import Expenses (2.01 + Importação)
    ...(imp ? [imp, ...(pp_imp ? [pp_imp] : [])] : []),

    // Main expense groups - this needs careful handling to insert pp rows
    // Need to iterate mainGroups and insert corresponding pp_node if it exists
  ];

  // Add revenue nodes up to Descontos Financeiros + its percentage row
  finalPnl.push(nodes['1'], nodes['2']);
  if (taxRoot) finalPnl.push(taxRoot);
  if (taxChildren) finalPnl.push(...taxChildren);
  if (pp_tax3) finalPnl.push(pp_tax3);

  if (stRoot) finalPnl.push(stRoot);
  if (stChildren) finalPnl.push(...stChildren);

  finalPnl.push(nodes['5']);
  if (pp_descontos) finalPnl.push(pp_descontos);

  // Net Revenue & its margins
  finalPnl.push(nodes['6'], margem);

  // COGS
  finalPnl.push(nodes['7'], nodes['8'], nodes['9'], nodes['10']);

  // Operating Income & its margin
  finalPnl.push(opIncome, margemOpIncome);

  // 2.07 + Operacionais & its percentage
  if (op) finalPnl.push(op);
  if (pp_op) finalPnl.push(pp_op);

  // Lucro Bruto & its margin
  finalPnl.push(lucroBruto, margemLucroBruto);

  // 2.01 + Importação & its percentage
  if (imp) finalPnl.push(imp);
  if (pp_imp) finalPnl.push(pp_imp);
  
  // Iterate through mainGroups and add them and their corresponding percentage rows
  const mainGroupsWithPercentages: PnLNode[] = [];
  mainGroups.forEach(group => {
    mainGroupsWithPercentages.push(group);
    if (group.id === despesasPessoalGroup?.id && pp_despesasPessoal) mainGroupsWithPercentages.push(pp_despesasPessoal);
    else if (group.id === geraisAdminGroup?.id && pp_geraisAdmin) mainGroupsWithPercentages.push(pp_geraisAdmin);
    else if (group.id === marketingComercialGroup?.id && pp_marketingComercial) mainGroupsWithPercentages.push(pp_marketingComercial);
    else if (group.id === tradeMarketingGroup?.id && pp_tradeMarketing) mainGroupsWithPercentages.push(pp_tradeMarketing);
    else if (group.id === servicosTomadosGroup?.id && pp_servicosTomados) mainGroupsWithPercentages.push(pp_servicosTomados);
  });
  finalPnl.push(...mainGroupsWithPercentages);

  // EBITDA & its margin
  finalPnl.push(ebitda, margemEbitda);

  // 2.06 + Financeiras & its percentage
  if (fin6) finalPnl.push(fin6);
  if (pp_fin6) finalPnl.push(pp_fin6);

  // 2.02 + Tributárias & its percentage
  if (fin2) finalPnl.push(fin2);
  if (pp_fin2) finalPnl.push(pp_fin2);
  
  // Net Profit & its margin
  finalPnl.push(netProfit, margemNetProfit);

  // Other expenses (Desconsiderados)
  if (other) finalPnl.push(other);
  
  // Sub-expenses (children of groups)
  finalPnl.push(...subExpenses);

  return finalPnl;
}
```
*Self-correction on `buildPnl` structure:* The previous `return [...]` was a direct array construction. To insert new rows cleanly, it's better to build the `finalPnl` array step-by-step or interleave the new percentage rows more carefully. The logic for `mainGroups` needs to be specific to insert the percentage row immediately after its parent group. The parent of the percentage row (`pp_tax3`) should be `taxRoot`, not its children. So, `pp_tax3` should be inserted after `taxRoot`. If `taxChildren` are always displayed, visually it will be below `taxRoot` but before `taxChildren` if `taxRoot` is just a header for them. The request is "below Impostos sobre receita", which is `taxRoot`.

Revised `buildPnl` insertion points:
- `pp_tax3` after `taxRoot`.
- `pp_descontos` after `nodes['5']`.
- `pp_op` after `op`.
- `pp_imp` after `imp`.
- For `mainGroups`, I need to iterate and if a group matches one of the parents, insert its `pp_node` right after.
- `pp_fin6` after `fin6`.
- `pp_fin2` after `fin2`.

```ts
// pnl-matrix/lib/pnlLogic.ts (Corrected buildPnl Structure)

export async function buildPnl(year: number): Promise<PnLNode[]> {
  // ... (declarations as before: revenueLines, cogsLines, expenseLines, nodes, groups, months, intermediate rows, taxRoot, taxChildren, stRoot, stChildren, specific groups like imp, op, fin6, fin2, other) ...
  // ... (grossRevenueNode and createParentPercentageNode helper as before) ...
  // ... (creation of all pp_... nodes as before) ...

  const result: PnLNode[] = [];

  // Revenue section
  result.push(nodes['1']); // Receita Bruta
  result.push(nodes['2']); // Devoluções
  if (taxRoot) {
    result.push(taxRoot); // Impostos sobre receita
    if (pp_tax3) result.push(pp_tax3); // % of Gross Revenue for Impostos sobre receita
    if (taxChildren) result.push(...taxChildren);
  }
  if (stRoot) {
    result.push(stRoot); // Impostos ST
    // No percentage row requested for stRoot
    if (stChildren) result.push(...stChildren);
  }
  result.push(nodes['5']); // Descontos Financeiros
  if (pp_descontos) result.push(pp_descontos); // % of Gross Revenue for Descontos Financeiros

  result.push(nodes['6']); // Receita Líquida
  result.push(margem);     // Margem % Receita Líquida

  // COGS section
  result.push(nodes['7'], nodes['8'], nodes['9'], nodes['10']);

  result.push(opIncome);       // Receita Operacional
  result.push(margemOpIncome); // Margem % Receita Operacional

  if (op) { // 2.07 + Operacionais
    result.push(op);
    if (pp_op) result.push(pp_op); // % of Gross Revenue for Operacionais
  }

  result.push(lucroBruto);         // Lucro Bruto
  result.push(margemLucroBruto); // Margem % Lucro Bruto

  if (imp) { // 2.01 + Importação
    result.push(imp);
    if (pp_imp) result.push(pp_imp); // % of Gross Revenue for Importação
  }

  // Main expense groups (2.03, 2.04, 2.05, 2.08, 2.09)
  mainGroups.forEach(group => {
    result.push(group);
    if (group.id === despesasPessoalGroup?.id && pp_despesasPessoal) result.push(pp_despesasPessoal);
    else if (group.id === geraisAdminGroup?.id && pp_geraisAdmin) result.push(pp_geraisAdmin);
    else if (group.id === marketingComercialGroup?.id && pp_marketingComercial) result.push(pp_marketingComercial);
    else if (group.id === tradeMarketingGroup?.id && pp_tradeMarketing) result.push(pp_tradeMarketing);
    else if (group.id === servicosTomadosGroup?.id && pp_servicosTomados) result.push(pp_servicosTomados);
  });

  result.push(ebitda);         // EBITDA
  result.push(margemEbitda); // Margem % EBITDA

  if (fin6) { // 2.06 + Financeiras
    result.push(fin6);
    if (pp_fin6) result.push(pp_fin6); // % of Gross Revenue for Financeiras
  }
  if (fin2) { // 2.02 + Tributárias
    result.push(fin2);
    if (pp_fin2) result.push(pp_fin2); // % of Gross Revenue for Tributárias
  }

  result.push(netProfit);         // Lucro Líquido
  result.push(margemNetProfit); // Margem % Lucro Líquido

  if (other) result.push(other); // Desconsiderados

  result.push(...subExpenses); // Children of expense groups

  return result;
}
```

### Step 2.3: Update `PnLTable.tsx` for Styling and Rendering

**File:** `pnl-matrix/components/PnLTable.tsx`

**Changes:**
1.  **Update `renderVal`**: Modify it to format `kind: 'parent_percentage'` as a percentage.
2.  **Update `isBold` for month cell values**: Ensure `kind: 'parent_percentage'` values are NOT bold.
3.  **Update `<tr>` styling**: Add a rule for `kind: 'parent_percentage'` to apply `font-italic` and ensure default text/background colors (i.e., no specific background like blue or green, and not the `bg-[#e3e6f1]` for default children).

```tsx
// pnl-matrix/components/PnLTable.tsx

// 1. Update renderVal
const renderVal = (row: any, m: Month) => {
  const v = row.original.values[m] || 0;
  return (row.original.kind === 'percentage' || row.original.kind === 'parent_percentage') // MODIFIED
    ? Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v / 100)
    : fmt(v);
};

// ... (type Node needs to be updated if not already done, but PnLNode in lib/pnlLogic.ts is the source of truth for the kind)
// type Node = PnLNode & { kind?: 'intermediate'|'percentage'|'family'|'loading'|'parent_percentage' }; // Ensure this is consistent if used locally

// ...

// 2. Update monthCols cell's isBold logic
// In monthCols.cell:
const kind = row.original.kind;
// MODIFIED isBold:
const isBold = kind === 'family' || kind === 'intermediate' || (kind !== 'percentage' && kind !== 'loading' && kind !== 'parent_percentage');
// ... rest of monthCols.cell logic ...

// ...

// 3. Update <tr> styling in the tbody mapping
// {table.getRowModel().rows.map((row) => (
//   <tr
//     key={row.id}
//     className={clsx(
//       'border-b last:border-0',
//       row.original.kind === 'family'  && 'bg-emerald-50',
//       row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
//       (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white',
//       row.original.kind === 'parent_percentage' && 'italic', // ADDED for italic text, default colors will apply
//       !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]' // Existing for default children
//     )}
//   >
// ...
```
*Self-correction for `<tr>` styling:* The order of `clsx` matters if there are conflicting styles. `italic` is fine. For default colors, we need to ensure that `parent_percentage` rows *don't* get `bg-blue-900 text-white` or `bg-[#e3e6f1]`. The current structure of `clsx` seems to handle this correctly as `parent_percentage` is a distinct condition.

---

## 4. Validation Checklist

1.  **Row Creation & Placement:**
    *   Verify all 11 new percentage rows appear in the P&L table.
    *   Confirm each new row is directly below its correct parent row as specified.
    *   Confirm the label (first column) for these new rows is blank.
2.  **Calculation:**
    *   For several sample months and for each new percentage row, verify the calculation: `(Parent Value / Gross Revenue from row '1') * 100%`.
    *   Check behavior when Gross Revenue is zero for a month (should display 0% or as handled by `renderVal`).
3.  **Styling:**
    *   Verify text (values in month columns) for `kind: 'parent_percentage'` rows is *italic*.
    *   Verify text (values in month columns) for `kind: 'parent_percentage'` rows is **NOT** bold.
    *   Verify these rows use default text color (e.g., black/dark gray, not white like intermediate/percentage rows).
    *   Verify these rows use default background color (e.g., white or transparent, not blue, green, or `bg-[#e3e6f1]`).
4.  **Impact on Other Rows:**
    *   Ensure styling (bolding, colors, italics) of all other row kinds (`intermediate`, `percentage`, `family`, `loading`, default data) is unchanged and correct.
    *   Verify functionality (drill-downs, modals) is unaffected.
    *   Verify percentage formatting for existing `'percentage'` rows and new `'parent_percentage'` rows is correct (e.g., "15.5%").

---
This PRD outlines the necessary steps. It's fairly complex due to the precise insertion points in `buildPnl` and the new styling rules. Let me know when you're ready to proceed with implementation, or if you have any adjustments to this plan (especially regarding the duplicate "2.05 + Marketing / Comercial" or the exact placement of the percentage row for `taxRoot`).


### o4-mini comments

The PRD you sketched is on-point and covers all of the major plumbing and styling changes. A couple of small gaps I’d fill before you start coding:

1)  Extend PnLNode’s union **and** the local `Node` alias  
    • In `lib/pnlLogic.ts` you added `'parent_percentage'` to the `kind` union—great. Don’t forget to mirror that in `components/PnLTable.tsx`’s `type Node = PnLNode & { kind?: … }` so TypeScript knows about it.

2)  Prevent these rows from becoming “clickable leaves”  
    • Today the month-cell logic treats anything that isn’t an intermediate/family row as a clickable leaf. You’ll want to update  
       ```js
         const isClickableLeaf = 
           !row.getCanExpand() && 
           !isIntermediate && 
           !isFamilyRow;
       ```  
      to also exclude `kind==='parent_percentage'`, otherwise those blank rows will render as underlined buttons.

3)  (Optional) Indentation/parentId  
    • Right now you set `label:''` and leave `parentId` blank, so the new rows float at depth 0 but in the correct array position. If you’d rather have them indented under their parent, give them `parentId: parentNode.id` so `row.depth` will pick up and push them in.

---

With those tweaks in place, your steps for:

- Adding the new kind  
- Building 11 `pp_*` nodes in `buildPnl`  
- Inserting each right after its parent  
- Formatting them as percentages in `renderVal`  
- Excluding them from bolding and adding `italic` in `<tr>`  

…will cover everything. Let me know if you’d like to roll into implementation next!
