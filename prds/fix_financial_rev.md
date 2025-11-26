Okay, the JSON data structure for `financial_revenue` provides a crucial insight: the `values` for months are **strings of concatenated, zero-padded numbers, not actual numeric values**.

Example: `"2025-01": "03133.168087.034680.06"` appears to represent three separate numbers: `3133.16`, `8087.03`, and `4680.06`. This is a *major* factor causing `NaN` issues because standard JavaScript arithmetic operations (`+`, `+=`) on these strings will result in string concatenation or `NaN`, not numeric sums.

We need to parse these strings into actual numbers *before* any aggregation. The rest of the PRD (expandability, drilldown structure) remains largely valid, but the data processing step is the critical fix.

Let's create a new, consolidated PRD that addresses this.

# PRD: Financial Revenues – Data Parsing, NaN & Drilldown Fixes

## 0. Objective
1.  **Correctly parse concatenated string values** for "Receitas Financeiras" from the API into actual numbers for each month.
2.  Eliminate `NaN` values in "Receitas Financeiras", "EBITDA", and other affected P&L rows by ensuring proper numeric aggregation *after parsing*.
3.  Enable expandability for the financial revenue sub-groups ("Não operacionais/ não tributadas" and "Não operacionais/ tributadas").
4.  Ensure that when a sub-group is expanded, it displays the underlying revenue categories (e.g., "Entrada não tributada") with their respective summed values, correctly formatted as plain numbers.
5.  The expander icon (▶/▼) should function correctly for these sub-groups.

## 1. Backend Changes

The backend (`lib/financialRevenue.ts`, `lib/pnlLogic.ts`, API routes) is assumed to be delivering the data structure as seen in `financial_data_ex.json` for the `financialRevenueNode.meta.frBySup` and its nested `vals`. The critical change is how `pnlLogic.ts` *consumes and processes* these string values.

**No SQL or API route changes are needed *if* the JSON structure is the intended output from `pnlLogic.ts`. If `pnlLogic.ts` is supposed to sum these up *before* sending to the client, then `pnlLogic.ts` is where the parsing should happen.**

Assuming the parsing needs to happen when `pnlLogic.ts` *builds* the `financialRevenueNode` (which is the most robust place):

### 1.1. Update `lib/pnlLogic.ts` - Value Parsing and Aggregation

The core of the fix lies in how `totFR`, `sup.vals`, and `cat[r.ym]` are calculated. They must parse the concatenated string values from `frRows` (which are the direct result from `getFinancialRevenueData`).

**Helper Function to Parse and Sum Concatenated Number Strings:**
Add this helper function within `lib/pnlLogic.ts` or import it if it's a general utility.

```typescript
// lib/pnlLogic.ts

function parseAndSumFinancialValueString(valueString: string | number): number {
  if (typeof valueString === 'number') {
    return valueString; // Already a number (e.g., for months with 0 or single entries)
  }
  if (typeof valueString !== 'string' || !valueString) {
    return 0;
  }

  let sum = 0;
  // Assuming numbers are zero-padded and concatenated, and always have two decimal places.
  // This regex matches sequences of digits, optionally followed by a dot and two more digits.
  // Example: "03133.168087.034680.06"
  // A more robust way would be if the backend could provide an array of numbers or if the length of each number was fixed.
  // This current approach assumes values are directly concatenated.
  // A simpler fixed-length approach if each number is e.g. 10 chars long including padding and dot:
  // for (let i = 0; i < valueString.length; i += 10) { // Assuming fixed length for each number, e.g. "000123.45"
  //   const numStr = valueString.substring(i, i + 10);
  //   sum += parseFloat(numStr) || 0;
  // }

  // Based on the example, it looks like values are not fixed length but rather concatenated.
  // "03133.16" + "8087.03" + "4680.06"
  // This is very tricky to parse reliably without a clear delimiter or fixed length.
  // The example "03133.168087.034680.06" looks like it could be:
  // 3133.16, 8087.03, 4680.06 OR
  // 3133.168087, 0.03, 4680.06 etc.
  //
  // **CRITICAL ASSUMPTION REVISITED:** The JSON example shows strings like "03133.168087.034680.06".
  // This is NOT a sum of numbers. This string IS the value for that month for that category.
  // The `NaN` is because `parseFloat("03133.168087.034680.06")` is `NaN` or a partial parse.
  // If the string *itself* is the value (e.g. a single large number with leading zeros for some reason),
  // then `parseFloat` is the correct function.
  //
  // Given the example data's `values` fields in `financial_data_ex.json`:
  // "2025-01": "03133.168087.034680.06"
  // These are *not* sums. These look like single numbers with leading zeros that are then summed.
  // The issue must be that r.valor is a string "03133.16" etc. and parseFloat is needed.

  // Let's assume `r.valor` from the database `FinancialRevenueRow` is already a `number`
  // due to `CAST(... AS DECIMAL(15,2))`.
  // The problem is likely in how the `meta.frBySup` and its `vals` are being *constructed*
  // if they end up with concatenated strings.

  // Re-evaluating `financial_data_ex.json`:
  // The `values` under the main `financial_revenue` node and under `frBySup.vals` ARE concatenated strings.
  // The `values` under `frBySup.cats.vals` are ALSO concatenated strings.
  // This means the aggregation logic in pnlLogic.ts IS producing these strings.

  // The `parseFloat` must happen when these strings are to be used in arithmetic (e.g. for display or further sum).
  // However, for aggregation within pnlLogic, we should be working with numbers.
  return parseFloat(String(valueString)) || 0; // Ensure it's a string before parseFloat, then fallback to 0
}
```

**Revised Aggregation in `buildPnl` in `lib/pnlLogic.ts`:**
The `r.valor` from `FinancialRevenueRow` should already be a number thanks to the `CAST` in SQL and `parseFloat` in `getFinancialRevenueData` (if it wasn't already a number type from the DB driver). The issue is the *re-aggregation* for `totFR`, `sup.vals`, and `cat.vals`.

```typescript
// lib/pnlLogic.ts
// Inside export async function buildPnl(year: number): Promise<PnLNode[]> {
// ...
  // --- Financial Revenue Integration ---
  const months = Object.keys(emptyYear(year)) as Month[];
  const frRows = await getFinancialRevenueData(year); // Assuming nomeProjeto is not needed here per last fix
  const totFR: Record<Month, number> = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  
  // This is where the frBySup.vals and frBySup.cats.vals are constructed. They MUST store numbers.
  const bySup = new Map<string, {
    vals: Record<Month, number>; // MUST BE NUMBERS
    byCat: Map<string, Record<Month, number>>; // MUST BE NUMBERS
  }>();

  for (const r of frRows) { // r.valor here is critical. It SHOULD be a number.
    const valorNum = Number(r.valor) || 0; // Ensure r.valor is treated as a number

    totFR[r.ym] = (totFR[r.ym] || 0) + valorNum;

    let supGroup = bySup.get(r.categoria_descricao_superior);
    if (!supGroup) {
      supGroup = {
        vals: Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>,
        byCat: new Map()
      };
      bySup.set(r.categoria_descricao_superior, supGroup);
    }
    supGroup.vals[r.ym] = (supGroup.vals[r.ym] || 0) + valorNum;

    let catGroup = supGroup.byCat.get(r.categoria_descricao);
    if (!catGroup) {
      catGroup = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
      supGroup.byCat.set(r.categoria_descricao, catGroup);
    }
    catGroup[r.ym] = (catGroup[r.ym] || 0) + valorNum;
  }

  const financialRevenueNode: PnLNode = {
    id: 'financial_revenue',
    label: 'Receitas Financeiras / Financial Revenues',
    values: totFR, // totFR now contains numbers
    kind: 'group',
    meta: { // This data structure is passed to the frontend
      frBySup: Array.from(bySup.entries()).map(([supLabel, s]) => ({
        supLabel,
        vals: s.vals, // s.vals now contains numbers
        cats: Array.from(s.byCat.entries()).map(([catLabel, catVals]) => ({ // catVals now numbers
          catLabel,
          vals: catVals
        }))
      }))
    }
  };
  // --- End Financial Revenue Integration ---

  // ... (rest of buildPnl, including adding financialRevenueNode to finalPnlRows) ...

  // --- Impact on EBITDA and Net Profit (Crucial for NaN fix) ---
  months.forEach(m => {
    const frMonthValue = totFR[m] || 0;

    if (ebitda) { // Ensure ebitda node exists
      ebitda.values[m] = (Number(ebitda.values[m]) || 0) + frMonthValue;
    }
    if (netProfit) { // Ensure netProfit node exists
      netProfit.values[m] = (Number(netProfit.values[m]) || 0) + frMonthValue;
    }
    // Also update LAIR if it's a separate node used in IR/CSLL calculation before Net Profit
    // const lairNode = finalPnlRows.find(n => n?.id === 'lair');
    // if (lairNode) {
    //   lairNode.values[m] = (Number(lairNode.values[m]) || 0) + frMonthValue;
    // }
  });
// ...
```
**Key Change Explanation:**
The critical part is ensuring that `r.valor` (from `FinancialRevenueRow`) is correctly treated as a number when it's used in aggregations for `totFR`, `supGroup.vals`, and `catGroup`. The `CAST AS DECIMAL` in SQL should make the database driver return a number or a string that `Number()` can parse. The `(variable || 0) + valorNum` pattern ensures that if a previous sum was `undefined` or `NaN`, it defaults to `0` before adding.

If `r.valor` itself is the concatenated string (meaning the SQL `CAST` is not effective or the DB driver returns it as a string anyway), then `r.valor` would need the `parseAndSumFinancialValueString` treatment *inside the loop*. However, the `financial_data_ex.json` seems to show that the *output* of the aggregation in `pnlLogic` (the `meta.frBySup...vals`) becomes these concatenated strings. This implies the *input* `r.valor` for each row *should be a single number*. The problem is likely in the re-aggregation logic if it somehow converts numbers back to strings and concatenates them. The fix above ensures all `vals` dictionaries store numbers.

## 2. Frontend Changes (`components/PnLTable.tsx`)

The frontend changes from the previous PRD (Revision "NaN & Drilldown Fixes") are still mostly valid, as they correctly set up the structure for drilldown. The main addition is to ensure that when values from `meta.frBySup...vals` (which should now be numbers after the `pnlLogic.ts` fix) are rendered, they are formatted correctly. The `renderVal` function typically handles currency, so we need to bypass it for these plain numbers.

### 2.1. Numeric Formatting in Month Cell Renderer (Re-confirm/Adjust)
This was part of the previous PRD for `isFRLeaf`. We need to ensure it also applies to the sub-group totals if they are displayed directly.

```typescript
// components/PnLTable.tsx
// In const cols = React.useMemo<ColumnDef<Node>[]>((...) => { ... monthCols.map((m) => ({ cell: ... })) ... });

      // ...
      cell: ({ row }: { row: any }) => {
        // ... (existing checks for '1_volumes', 'breakdown', etc.)

        const kind = row.original.kind;
        const v = row.original.values[m] || 0; // This v should be a number from pnlLogic

        // Handle Financial Revenue Sub-Group and Leaf (Category) rendering
        const isFRSubGroup = kind === 'financial_revenue_subgroup';
        const isFRLeaf = row.original.parentId?.startsWith('financial_revenue_') && kind === 'family';

        if (isFRSubGroup || isFRLeaf) {
          // Values for FR sub-groups and leaves should be plain numbers
          const displayValue = Number.isInteger(v) ? `${v}` : v.toFixed(2);
          
          if (isFRLeaf) { // FR Leaf items are clickable for modal
            return (
              <button
                className="text-right w-full hover:underline font-bold" // Style as needed
                onClick={() => {
                  if (onCellClick && row.original.meta) { // meta contains sup & cat for FR leaf
                    onCellClick({
                      ym: m,
                      rowId: row.original.id,
                      kind: 'fr_detail', // Ensure onCellClick handles this
                      // Pass context needed for API call to fetch modal details
                      financialRevenueContext: {
                        categoria_descricao_superior: row.original.meta.sup,
                        categoria_descricao: row.original.meta.cat,
                      }
                    });
                  }
                }}
              >
                {displayValue}
              </button>
            );
          } else { // FR Sub-Group (isFRSubGroup is true, isFRLeaf is false)
            return <span className="text-right w-full font-bold">{displayValue}</span>; // Style as needed, typically bold
          }
        }

        // ... (existing volume formatting, if any, should be placed before this general block)

        // Existing general value rendering (percentages, BRL currency)
        const isDetailPercentage = kind === 'detailPercentage';
        // isBold, isClickableLeaf might need adjustment if they conflict with FR logic above
        // ... (your existing renderVal call and button/span for other rows) ...
        const valueToRender = (kind === 'percentage' || kind === 'detailPercentage')
          ? Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v / 100)
          : fmt(v); // fmt is your BRL currency formatter

        // ... rest of your existing cell rendering logic for non-FR rows ...
        // This part will need careful integration with your existing `isClickableLeaf` and `renderVal` logic.
        // The FR-specific block above should take precedence.
      },
// ...
```

### 2.2. `getSubRows` and `getRowCanExpand` (As per previous PRD - Confirmed)

The `getSubRows` logic to map `meta.frBySup` to first-level nodes and then `meta.cats` to second-level nodes remains correct.
The `getRowCanExpand` logic also correctly identifies the main financial revenue node and the sub-groups (if they have categories) as expandable.

**A. `Node` Type in `PnLTable.tsx` (Confirmed):**
```typescript
// components/PnLTable.tsx
type Node = Omit<PnLNode, 'kind' | 'meta'> & { // Omit meta from PnLNode to redefine it more loosely
  kind?: 'breakdown' | 'intermediate' | 'percentage' | 'family' | 'loading' | 'detailPercentage' | 'volume_parent' | 'group' | 'financial_revenue_subgroup';
  meta?: any; // Allows different meta structures for different node kinds
};
```

**B. `getSubRows` for Financial Revenue (Confirmed):**
```typescript
// components/PnLTable.tsx
// Inside getSubRows = (n: Node) => { ... }

    // Financial Revenue: first level (sub-groups)
    if (n.id === 'financial_revenue' && n.meta?.frBySup) {
      return n.meta.frBySup.map((g: any) => ({ // g.vals should now be Record<Month, number>
        id: `financial_revenue_${g.supLabel.replace(/\W+/g, '_')}`,
        parentId: n.id,
        label: g.supLabel,
        values: g.vals, // These are numeric sums from pnlLogic
        kind: 'financial_revenue_subgroup',
        meta: { cats: g.cats, isExpandable: true } // Pass categories for next level
      }) as Node);
    }

    // Financial Revenue: second level (categories)
    // Ensure n.meta exists and n.meta.cats is an array before mapping
    if (n.kind === 'financial_revenue_subgroup' && n.meta && Array.isArray(n.meta.cats)) {
      return n.meta.cats.map((c: any) => ({ // c.vals should now be Record<Month, number>
        id: `${n.id}_cat_${c.catLabel.replace(/\W+/g, '_')}`,
        parentId: n.id,
        label: c.catLabel,
        values: c.vals, // These are numeric sums from pnlLogic
        kind: 'family', // Or a more specific 'financial_revenue_category'
        meta: { sup: n.label, cat: c.catLabel } // For modal click context
      }) as Node);
    }
// ... rest of getSubRows
```

**C. `getRowCanExpand` (Confirmed):**
```typescript
// components/PnLTable.tsx
// Inside useReactTable({ ... getRowCanExpand: (r) => ... })
    getRowCanExpand: (r) =>
      // ... existing conditions ...
      r.original.id === 'financial_revenue' ||
      (r.original.kind === 'financial_revenue_subgroup' && r.original.meta?.cats?.length > 0) ||
      // ... other existing conditions ...
```

## 3. Verification Steps
1.  **Data Type Check**: In `lib/pnlLogic.ts`, before `financialRevenueNode` is pushed, log `totFR` and the `vals` within `meta.frBySup` and `meta.frBySup.cats`. Confirm all month values are numbers, not strings.
2.  **Load P&L:**
    *   "Receitas Financeiras", "EBITDA", "Lucro Líquido" must show correct, numeric sums (not `R$ NaN`).
3.  **Expand "Receitas Financeiras":**
    *   Sub-groups ("Não operacionais/ não tributadas", etc.) appear with expander icons (▶).
    *   Sub-group monthly values are plain numbers, correctly summed.
4.  **Expand a Sub-Group:**
    *   Expander changes to ▼.
    *   Revenue categories appear underneath.
    *   Category monthly values are plain numbers.
5.  **Modal Click:** Clicking a category value triggers the modal with correct details.
6.  **Collapse All:** Expanders correctly collapse sections.
7.  **No Regressions:** Other P&L sections behave as before.

This revised PRD places the strongest emphasis on ensuring that the data processing in `lib/pnlLogic.ts` correctly handles the values as numbers *throughout the aggregation process for financial revenues*. The frontend then just needs to render these numbers appropriately.
