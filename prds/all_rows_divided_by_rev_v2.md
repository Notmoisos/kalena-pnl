
Okay, this is an interesting new set of requirements! These "sub-percentage" rows will provide more granular insight into how various cost and expense items relate to Gross Revenue.

Here's a PRD to outline the implementation:

# PRD: Add Detail Percentage Rows Relative to Gross Revenue

**Objective:** Introduce new percentage-based rows beneath specific financial items in the P&L. These rows will calculate the parent item's value as a percentage of "Receita Bruta / Gross Revenue". They will have a distinct style: default background/text color, italic text, non-bold values, and a blank label in the first column. These rows should appear in the main P&L structure, not as expandable sub-rows.

---

## 1. New Rows, Calculations, and Placement

All new rows will:
*   Have a **blank label** (first column).
*   Calculate their monthly values as: `(Parent Row Value for Month / Receita Bruta for Month) * 100`.
*   Be styled with *italic text*, default background/text colors, and their percentage values will **not** be bold.
*   A new `kind` will be introduced: `'detailPercentage'`.

**Target Parent Rows & Placement of New Percentage Rows:**

The new percentage rows will appear directly below the following existing rows:

| Parent Row Description             | Parent Row Reference (in `pnlLogic.ts`) | New Row ID (Example)       |
| :--------------------------------- | :---------------------------------------- | :------------------------- |
| a. Impostos sobre receita          | `taxRoot` (ID: `tax3`)                  | `tax3_percGross`           |
| b. Descontos Financeiros           | `nodes['5']`                            | `node5_percGross`          |
| c. 2.07 + Operacionais             | `op` (group)                            | `op_percGross`             |
| d. 2.01 + Importação               | `imp` (group)                           | `imp_percGross`            |
| e. 2.03 + Despesas com Pessoal     | Specific group from `mainGroups`          | `grpPessoal_percGross`     |
| f. 2.04 + Gerais e administrativas | Specific group from `mainGroups`          | `grpGerais_percGross`      |
| g. 2.05 + Marketing / Comercial    | Specific group from `mainGroups`          | `grpMarketing_percGross`   |
| i. 2.08 + Trade Marketing          | Specific group from `mainGroups`          | `grpTradeMkt_percGross`    |
| j. 2.09 + Serviços tomados         | Specific group from `mainGroups`          | `grpServicos_percGross`    |
| k. 2.06 + Financeiras              | `fin6` (group)                          | `fin6_percGross`           |
| l. 2.02 + Tributárias              | `fin2` (group)                          | `fin2_percGross`           |

*(Note: User listed "2.05 + Marketing / Comercial" twice; it's included once.)*

---

## 2. File & High-Level Impact

| File                               | Purpose                                                                                                                                                              |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnl-matrix/lib/pnlLogic.ts`       | - Add `'detailPercentage'` to `PnLNode.kind` type. <br/> - Create a new function or extend `buildIntermediateRows` to define and calculate these new percentage rows. <br/> - Modify `buildPnl` to correctly place these new rows in the P&L structure. |
| `pnl-matrix/components/PnLTable.tsx` | - Update `<tr>` styling to ensure `'detailPercentage'` rows have default background/text colors. <br/> - Update `cell` renderers to make text italic for `'detailPercentage'` rows, ensure their labels are blank, and their values are not bold. |

---

## 3. Detailed Changes

### Step 3.1: Update `lib/pnlLogic.ts`

**A. Extend `PnLNode.kind` Type**

```typescript
// pnl-matrix/lib/pnlLogic.ts
export type PnLNode = {
  // ... existing properties
  kind?: 'intermediate' | 'percentage' | 'family' | 'loading' | 'detailPercentage'; // ADDED 'detailPercentage'
  // ...
};
```

**B. Create Function to Build Detail Percentage Rows**

A new helper function will be created to generate these rows. This keeps `buildIntermediateRows` focused.

```typescript
// pnl-matrix/lib/pnlLogic.ts

// ... (after emptyYear function or similar utility spot)

function createDetailPercentageRow(
  parentId: string,
  parentRow: PnLNode | undefined,
  receitaBrutaNode: PnLNode,
  months: Month[]
): PnLNode | null {
  if (!parentRow) return null;

  const yearForEmpty = months[0].slice(0, 4) as unknown as number;
  const detailPercNode: PnLNode = {
    id: `${parentId}_percGross`,
    label: '', // Blank label
    kind: 'detailPercentage',
    values: emptyYear(yearForEmpty)
  };

  months.forEach(m => {
    const parentValue = parentRow.values[m] || 0;
    const receitaBrutaValue = receitaBrutaNode.values[m];
    // Take absolute of parent value for percentage calculation if sign is '-'
    // Or, ensure logic aligns with how parent value contributes (e.g., expenses are often positive numbers but reduce profit)
    // For simplicity here, assuming parentValue is the number to be divided.
    // Business logic might require Math.abs(parentValue) if parentRow.sign === '-'
    // For now, we'll use parentValue directly as it appears in the PnL.
    detailPercNode.values[m] = (receitaBrutaValue && receitaBrutaValue !== 0) ? (parentValue / receitaBrutaValue) * 100 : 0;
  });
  return detailPercNode;
}

// This function will be called from buildPnl or buildIntermediateRows
// to generate all necessary detail percentage rows.
// For example, in buildIntermediateRows or a new function called by buildPnl:
export function buildDetailPercentageRows(
  nodes: Record<string, PnLNode>,
  groups: Record<string, PnLNode>, // Includes op, imp, fin6, fin2, and mainGroups items
  taxRoot: PnLNode | undefined,
  months: Month[]
): Record<string, PnLNode> {
  const receitaBrutaNode = nodes['1'];
  if (!receitaBrutaNode) return {};

  const detailPercentageNodes: Record<string, PnLNode> = {};

  const createAndStore = (idPrefix: string, parentNode: PnLNode | undefined) => {
    const node = createDetailPercentageRow(idPrefix, parentNode, receitaBrutaNode, months);
    if (node) detailPercentageNodes[node.id] = node;
  };

  // a. Below Impostos sobre receita (taxRoot)
  createAndStore('tax3', taxRoot);

  // b. Below Descontos Financeiros (nodes['5'])
  createAndStore('node5', nodes['5']);

  // Helper to find specific groups by label substring
  const findGroup = (labelSubstring: string) => Object.values(groups).find(g => g.label.includes(labelSubstring));

  // c. Below 2.07 + Operacionais
  createAndStore('opGrp', findGroup('2.07 + Operacionais'));

  // d. Below 2.01 + Importação
  createAndStore('impGrp', findGroup('2.01 + Importação'));

  // e. Below 2.03 + Despesas com Pessoal
  createAndStore('pessoalGrp', findGroup('2.03 + Despesas com Pessoal'));

  // f. Below 2.04 + Gerais e administrativas
  createAndStore('geraisGrp', findGroup('2.04 + Gerais e administrativas'));

  // g. Below 2.05 + Marketing / Comercial
  createAndStore('marketingGrp', findGroup('2.05 + Marketing / Comercial'));

  // i. Below 2.08 + Trade Marketing
  createAndStore('tradeMktGrp', findGroup('2.08 + Trade Marketing'));

  // j. Below 2.09 + Serviços tomados
  createAndStore('servicosGrp', findGroup('2.09 + Serviços tomados'));

  // k. Below 2.06 + Financeiras
  createAndStore('fin6Grp', findGroup('2.06 + Financeiras'));

  // l. Below 2.02 + Tributárias
  createAndStore('fin2Grp', findGroup('2.02 + Tributárias'));

  return detailPercentageNodes;
}
```

**C. Update `buildPnl`**

The `buildPnl` function will need to call `buildDetailPercentageRows` and then carefully insert these new rows into the final array.

```typescript
// pnl-matrix/lib/pnlLogic.ts

export async function buildPnl(year: number): Promise<PnLNode[]> {
  // ... (existing setup: revenueLines, cogsLines, expenseLines, nodes, groups, months) ...

  const { /* existing intermediate rows */ margemOpIncome, margemLucroBruto, margemEbitda, margemNetProfit } =
    buildIntermediateRows(nodes, groups, months); // Assuming this is how they are currently fetched

  const taxRootNode = revenueLines.find(n => n.id === 'tax3'); // Get the actual taxRoot node for detail % calc

  // Generate the new detail percentage rows
  const detailPercRows = buildDetailPercentageRows(nodes, groups, taxRootNode, months);

  // ... (existing logic for taxRoots, stRoots, expense group ordering like imp, fin6, fin2, op, mainGroups) ...

  // Helper to get a detail percentage row if it exists
  const getDetailPerc = (parentId: string) => detailPercRows[`${parentId}_percGross`];

  // Find specific groups again if their direct references (op, imp etc.) are used for placement
  const opGroup = Object.values(groups).find(g => g.label.includes('2.07 + Operacionais'));
  const impGroup = Object.values(groups).find(g => g.label.includes('2.01 + Importação'));
  // ... find other groups as needed for precise placement if not covered by mainGroups iteration

  return [
    nodes['1'], // Receita Bruta
    nodes['2'], // Devoluções
    taxRoot,
    ...(taxRoot && getDetailPerc('tax3') ? [getDetailPerc('tax3')!] : []), // a. % Impostos
    ...taxChildren,
    stRoot, ...stChildren,
    nodes['5'],
    ...(nodes['5'] && getDetailPerc('node5') ? [getDetailPerc('node5')!] : []), // b. % Descontos Financeiros
    nodes['6'], margem,
    nodes['7'], nodes['8'], nodes['9'], nodes['10'],
    opIncome, margemOpIncome,

    // c. % Operacionais - op is 'grp_2.07 + Operacionais'
    ...(opGroup ? [opGroup, ...(getDetailPerc('opGrp') ? [getDetailPerc('opGrp')!] : [])] : []),
    
    lucroBruto, margemLucroBruto,

    // d. % Importação - imp is 'grp_2.01 + Importação'
    ...(impGroup ? [impGroup, ...(getDetailPerc('impGrp') ? [getDetailPerc('impGrp')!] : [])] : []),

    // Iterate for mainGroups (e, f, g, i, j)
    // This part needs careful integration with how mainGroups are currently ordered and rendered.
    // We might need to map mainGroups and insert the percentage row after each relevant group.
    ...mainGroups.flatMap(group => {
        const items = [group];
        let detailPercNode: PnLNode | undefined = undefined;
        if (group.label.includes('2.03 + Despesas com Pessoal')) detailPercNode = getDetailPerc('pessoalGrp');
        else if (group.label.includes('2.04 + Gerais e administrativas')) detailPercNode = getDetailPerc('geraisGrp');
        else if (group.label.includes('2.05 + Marketing / Comercial')) detailPercNode = getDetailPerc('marketingGrp');
        else if (group.label.includes('2.08 + Trade Marketing')) detailPercNode = getDetailPerc('tradeMktGrp');
        else if (group.label.includes('2.09 + Serviços tomados')) detailPercNode = getDetailPerc('servicosGrp');
        
        if (detailPercNode) items.push(detailPercNode);
        return items;
    }),

    ebitda, margemEbitda,

    // k. % Financeiras - fin6 is 'grp_2.06 + Financeiras'
    ...(fin6 ? [fin6, ...(getDetailPerc('fin6Grp') ? [getDetailPerc('fin6Grp')!] : [])] : []),

    // l. % Tributárias - fin2 is 'grp_2.02 + Tributárias'
    ...(fin2 ? [fin2, ...(getDetailPerc('fin2Grp') ? [getDetailPerc('fin2Grp')!] : [])] : []),
    
    netProfit, margemNetProfit,
    ...(other ? [other] : []), // Other expenses (Desconsiderados)
    ...subExpenses // Child sub-expenses of the groups
  ].filter(Boolean) as PnLNode[]; // filter(Boolean) to remove any null/undefined entries if parent rows were missing
}
```
*Self-correction on `buildPnl` structure*: The `op`, `imp`, `fin6`, `fin2` groups are usually filtered out of `mainGroups`. The current structure of `buildPnl` explicitly places them. So, inserting their respective `%` rows next to them is correct. For items within `mainGroups`, the `flatMap` approach is viable. Sub-expenses related to these groups should still render correctly as they are typically linked by `parentId`.

### Step 3.2: Update `pnl-matrix/components/PnLTable.tsx`

**A. Update `<tr>` Styling**

Ensure the new `detailPercentage` rows do *not* inherit styles from other kinds and instead use default browser/table styling for background and text color.

```tsx
// pnl-matrix/components/PnLTable.tsx
// ... in tbody map ...
            <tr
              key={row.id}
              className={clsx(
                'border-b last:border-0',
                row.original.kind === 'family'  && 'bg-emerald-50',
                row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
                // Ensure 'detailPercentage' is NOT caught by this next line:
                (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white',
                // 'detailPercentage' rows will not have a !row.original.kind and typically depth 0 or 1.
                // This existing rule for indented non-kind rows might need adjustment if detailPercentage rows have depth.
                // Assuming detailPercentage rows are at the same depth as their parents, this should be fine.
                !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]'
              )}
            >
// ...
```
No explicit class is needed for `detailPercentage` here if the goal is default styling, as long as it doesn't match other conditions.

**B. Update Cell Renderers**

*   **Month Columns (`monthCols`):**
    *   Apply `italic` style.
    *   Ensure values are **not** bold.
    *   Render as percentage.

```tsx
// pnl-matrix/components/PnLTable.tsx
// ... in monthCols cell renderer ...
cell: ({ row }: { row: any }) => {
  const kind = row.original.kind;
  const isDetailPercentage = kind === 'detailPercentage';
  // Adjust isBold to exclude detailPercentage, or ensure it's handled separately
  const isBold = (kind === 'family' || kind === 'intermediate' || (kind !== 'percentage' && kind !== 'loading' && !isDetailPercentage));

  // ... (isIntermediate, isFamilyRow, isClickableLeaf - these might need to consider 'detailPercentage' if it affects clickability)
  // For now, assuming detailPercentage rows are not clickable leaves for modals.
  const isClickableLeaf = !row.getCanExpand() && kind !== 'intermediate' && kind !== 'percentage' && kind !== 'family' && !isDetailPercentage;


  // The renderVal helper already handles kind === 'percentage'. We need to make sure 'detailPercentage' also uses percentage formatting.
  // We might need to adjust renderVal or duplicate its percentage logic.
  // For now, let's modify the value directly here if it's detailPercentage for clarity.
  let displayValue;
  if (kind === 'loading') {
    displayValue = '–';
  } else if (kind === 'detailPercentage') {
    const v = row.original.values[m] || 0;
    displayValue = Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v / 100);
  } else {
    displayValue = renderVal(row, m); // Existing logic for other types
  }

  if (isClickableLeaf) {
    return (
      <button
        className={clsx(
          "text-right w-full hover:underline",
          { 'font-bold': isBold }, // isBold already excludes detailPercentage
          { 'italic': isDetailPercentage }
        )}
        // ... onClick ...
      >
        {displayValue}
      </button>
    );
  }
  return (
    <span className={clsx(
      { 'font-bold': isBold }, // isBold already excludes detailPercentage
      { 'italic': isDetailPercentage }
    )}>
      {displayValue}
    </span>
  );
},
// ...
```
*Self-correction*: The `renderVal` function should be updated to handle `detailPercentage` for formatting, or the logic duplicated as shown. The `isBold` definition must explicitly exclude `detailPercentage`.

*   **Label Column (`accessorKey: 'label'`):**
    *   Render a blank string.
    *   Apply `italic` style.

```tsx
// pnl-matrix/components/PnLTable.tsx
// ... in 'label' column cell renderer ...
cell: ({ row, getValue }: { row: any; getValue: () => unknown }) => {
  const kind = row.original.kind;
  const isDetailPercentage = kind === 'detailPercentage';

  return (
    <span
      className={clsx(
        "whitespace-nowrap",
        { 'italic': isDetailPercentage } // Apply italic style
      )}
      style={{ paddingLeft: row.depth * 16 }}
    >
      {isDetailPercentage ? '' : getValue() as string} {/* Blank label */}
    </span>
  );
}
// ...
```

---

## 4. Validation Checklist

1.  **Row Presence & Order:** Verify all 11 new percentage rows appear directly below their respective parent rows in the correct order.
2.  **Blank Labels:** Confirm the first column (description) is blank for all new `'detailPercentage'` rows.
3.  **Calculations:** For several sample months and for each new row, manually verify that the percentage value is correctly calculated as `(Parent Row Value / Receita Bruta Value) * 100`.
4.  **Styling - Italic Text:** Confirm that both the (blank) label and the percentage values for all `'detailPercentage'` rows are displayed in *italic* text.
5.  **Styling - Not Bold Values:** Confirm that the percentage values in month columns for `'detailPercentage'` rows are **not** bold.
6.  **Styling - Default Colors:** Confirm `'detailPercentage'` rows use the default table row background and text colors (i.e., not blue like 'intermediate'/'percentage', not green like 'family', not gray like 'loading').
7.  **Existing Rows:**
    *   Verify that all existing rows (including 'intermediate', 'percentage', 'family', 'loading', and default data rows) retain their original calculations, styling (including font weights and colors), and functionality (expanders, modals).
    *   Specifically check that the original 'percentage' rows (e.g., "Margem % Receita Líquida") are unaffected and still show blue background and non-italic, non-bold text.
8.  **No New Sub-rows:** Confirm these new percentage rows are part of the main table and do not appear as children when a parent chevron is clicked.
9.  **Responsiveness & Layout:** Ensure the table layout remains consistent and no visual issues arise from the new rows.

---

This PRD outlines a comprehensive approach. The trickiest part will be the precise insertion logic within `buildPnl` to ensure correct ordering, especially around the `mainGroups`. The `flatMap` approach for `mainGroups` should work but needs to be tested carefully with the actual group data structure and ordering.


## o4-mini comments:

The PRD is very thorough and covers all of the moving parts—both on the logic side (`lib/pnlLogic.ts`) and the UI side (`PnLTable.tsx`). It correctly:

1. Extends the `kind` union to include `detailPercentage`.  
2. Introduces a helper (`createDetailPercentageRow`) to compute each new row’s values as (parent ÷ gross)×100.  
3. Provides a `buildDetailPercentageRows` function that wires up exactly the 11 parents you listed.  
4. Shows exactly how to splice those rows into `buildPnl`, immediately below their parents in the root array.  
5. Adjusts the table’s `<tr>` class names so that `detailPercentage` rows fall back to default colors.  
6. Updates the month‐cell renderers to:  
   • Render percentages for `detailPercentage`.  
   • Add `italic` styling and explicitly _not_ bold those values.  
7. Updates the label column to render a blank, italicized label for those rows.  

A couple of tiny alignment suggestions before you start coding:

• ID naming consistency   
  – Instead of hard‐coding prefixes like `opGrp`, you might simply use `parentRow.id` as the prefix for `_percGross`. That way your IDs come out as `tax3_percGross`, `5_percGross`, `grp_2.07 + Operacionais_percGross`, etc., exactly matching the “New Row ID” examples.  

• Percentage formatting utility   
  – You could fold the `detailPercentage` branch into your existing `renderVal` helper so you don’t have to duplicate the `Intl.NumberFormat('percent')` logic in two places.

Other than those minor refinements, the PRD has captured every requirement and the insertion points in both logic and UI. You’re good to go!
