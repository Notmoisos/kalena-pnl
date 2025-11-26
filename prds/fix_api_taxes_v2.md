OK, I've reviewed the `pnl-matrix/components/PnLTable.tsx` code.

The crucial part is within the `cell` renderer for the month columns (lines 48-74). Currently, it checks if a row is a "leaf" (not expandable and not intermediate/percentage). If it is a leaf, it attaches an `onClick` handler.

This `onClick` handler (lines 61-69) *always* calls `onCellClick`, but it conditionally adds a `kind` parameter *only if* the `row.original.id` exists in the hardcoded `revMap` (line 59). This `revMap` seems intended for revenue/COGS line items to trigger the `/api/nfe-details` or similar endpoints.

Crucially, **tax sub-rows** (like `tax3_PIS_Venda` or `taxIPI`) are also considered "leaf" nodes in this logic, but their IDs **are not** in `revMap`. Therefore, when a tax sub-row is clicked, the `onClick` handler fires, but it calls `onCellClick` with only `{ ym, rowId }`.

The `onCellClick` function itself (defined in the parent component, likely `app/pnl/page.tsx`) must be inspecting the parameters it receives (specifically the `rowId` and potentially the lack of a `kind`) and incorrectly deciding to fetch from `/api/despesa-details` instead of constructing the call to `/api/tax-details`.

Here's the PRD to fix this:

---

# PRD: Fix Tax Sub-Row Click Handler to Call Correct API

**Goal:** Ensure that clicking on a tax sub-row (e.g., PIS, Cofins, IPI, ICMS_ST) in the P&L table triggers a request to the `/api/tax-details` endpoint with the correct `ym`, `taxName`, and `scenario` parameters, instead of incorrectly calling `/api/despesa-details`.

**Problem Description:**

1.  **Incorrect API Call:** Clicking a tax sub-row currently triggers a network request to `/api/despesa-details` (e.g., `/api/despesa-details?ym=2025-03&code=Impostos%20ST&cat=ICMS_ST`), as observed in the browser's Network tab.
2.  **Root Cause (`PnLTable.tsx`):** The `cell` renderer logic for month columns in `PnLTable.tsx` identifies tax sub-rows as clickable "leaf" nodes. However, the `onClick` handler attached to these cells only passes `{ ym, rowId }` to the `onCellClick` prop because tax IDs (e.g., `tax3_PIS_Venda`, `taxIPI`) are not present in the `revMap` used to add a specific `kind`.
3.  **Root Cause (Parent Component):** The `onCellClick` handler function (likely defined in `app/pnl/page.tsx` or a similar parent component) receives `{ ym, rowId }` for tax rows. It appears this handler incorrectly interprets these parameters (perhaps based on the `rowId` format or the missing `kind`) as belonging to a general expense category, leading it to fetch from `/api/despesa-details` instead of parsing the `rowId` to extract `taxName` and `scenario` for a `/api/tax-details` call.

**Proposed Solution:**

Modify the `onClick` handler within the month `cell` renderer in `pnl-matrix/components/PnLTable.tsx` to specifically detect tax row IDs, parse them, and pass the correct parameters (`ym`, `taxName`, `scenario`, and potentially a `kind: 'tax'`) to the `onCellClick` prop.

**Code Changes (`pnl-matrix/components/PnLTable.tsx`):**

```diff
 // pnl-matrix/components/PnLTable.tsx

       cell: ({ row }: { row: any }) => {
         const isIntermediate = row.original.kind === 'intermediate' || row.original.kind === 'percentage';
-        const isLeaf = !row.getCanExpand() && !isIntermediate;
-        const revMap: any = { 1: 'ReceitaBruta', 2: 'Devolucao', 5: 'Desconto', 7: 'CPV', 8: 'CPV_Boni', 9: 'Perdas', 10: 'CPV_Devol' };
         const value = renderVal(row, m);
-        return isLeaf ? (
+        const isClickableLeaf = !row.getCanExpand() && !isIntermediate;
+
+        // Revenue/COGS mapping (for NFe details)
+        const revMap: Record<string, string> = {
+          '1': 'ReceitaBruta',
+          '2': 'Devolucao',
+          '5': 'Desconto',
+          '7': 'CPV',
+          '8': 'CPV_Boni',
+          '9': 'Perdas',
+          '10': 'CPV_Devol',
+        };
+
+        // Check if the row ID indicates a Tax row
+        const isTaxChild = /^tax(3|4)_/.test(row.original.id) || row.original.id === 'taxIPI';
+
+        // Determine if the cell should be a button
+        const isButtonClickable = isClickableLeaf && (revMap[row.original.id] || isTaxChild);
+
+        return isButtonClickable ? (
           <button
             className="text-right w-full hover:underline"
             onClick={() => {
               if (revMap[row.original.id]) {
+                // Handle Revenue/COGS clicks (existing logic)
                 onCellClick({ ym: m, rowId: row.original.id, kind: revMap[row.original.id] });
+              } else if (isTaxChild) {
+                // Handle Tax clicks
+                let taxName: string | undefined;
+                let scenario: string = 'Venda'; // Default scenario
+
+                if (row.original.id === 'taxIPI') {
+                  taxName = 'IPI';
+                } else {
+                  const parts = row.original.id.split('_'); // e.g., tax3_PIS_Venda
+                  if (parts.length >= 3) {
+                    taxName = parts[1]; // e.g., PIS, Cofins, ICMS_ST
+                    scenario = parts[2]; // e.g., Venda, Bonificacao
+                  } else if (parts.length === 2) { // Handle potential short IDs like tax3_ICMS?
+                    taxName = parts[1];
+                    // Keep default scenario = 'Venda'
+                  }
+                }
+
+                if (taxName) {
+                  // Pass specific tax details
+                  onCellClick({ ym: m, rowId: row.original.id, kind: 'tax', taxName: taxName, scenario: scenario });
+                } else {
+                  // Fallback if parsing failed unexpectedly
+                  console.warn('Could not parse tax details from ID:', row.original.id);
+                  // Optionally call onCellClick with generic params or do nothing
+                  // onCellClick({ ym: m, rowId: row.original.id });
+                }
+              } else if (isClickableLeaf) {
+                 // Handle other clickable leaves (e.g., Despesas which might not have a specific 'kind' yet)
+                 // This might be where the /api/despesa-details call originates
+                 // Pass the rowId; the parent handler decides what to do.
+                 onCellClick({ ym: m, rowId: row.original.id });
               }
-              else {
-                onCellClick({ ym: m, rowId: row.original.id });
-              }
-              }
-            }}\n+            }}
+            }}
           >\n             {value}\n           </button>
         ) : (
+          // Non-clickable cells (intermediate, expandable parents, or non-leaf/non-tax/non-rev rows)
           <span>{value}</span>
         );\n       },\n```

**Explanation of Changes:**

1.  **`isTaxChild` Check:** Added a specific check `isTaxChild` using a regex (`/^tax(3|4)_/`) and an explicit check for `taxIPI` to identify tax sub-rows based on their `id`.
2.  **`isButtonClickable` Check:** Refined the condition for rendering a button to be `isClickableLeaf && (revMap[row.original.id] || isTaxChild)`. This ensures only Revenue/COGS leaves *or* Tax leaves get a button.
3.  **Conditional `onClick` Logic:**
    *   If the clicked row is in `revMap`, the existing logic for Revenue/COGS details is kept.
    *   **Added `else if (isTaxChild)`:** This block now specifically handles tax rows.
        *   It parses the `row.original.id` to extract `taxName` and `scenario` (using logic similar to the previous PRD's suggestion).
        *   It calls `onCellClick` with an augmented context: `{ ym: m, rowId: row.original.id, kind: 'tax', taxName: taxName, scenario: scenario }`. Adding `kind: 'tax'` provides a clear signal to the parent handler.
    *   **Added `else if (isClickableLeaf)`:** This handles any *other* clickable leaf row that isn't Revenue/COGS or Tax. This is likely where the Despesa rows fall. It calls `onCellClick` with just `{ ym, rowId }`, allowing the parent handler to determine the endpoint (like `/api/despesa-details`) based on the `rowId`.
4.  **Parent Handler (`onCellClick`) Adaptation:** The parent component's `onCellClick` function will need a minor adjustment to check for `ctx.kind === 'tax'`. If true, it should use `ctx.taxName` and `ctx.scenario` to fetch from `/api/tax-details`. Otherwise, it can proceed with its existing logic for other `kind` values or simple `rowId`s. *(This PRD focuses on fixing `PnLTable.tsx`, but acknowledges the necessary change in the parent)*.

**Validation Steps:**

1.  Apply the code changes to `pnl-matrix/components/PnLTable.tsx`.
2.  Run the application (`pnpm dev`).
3.  Open the browser's Developer Tools Network tab.
4.  Click on a **Tax Sub-Row** (e.g., PIS under Impostos sobre Venda).
    *   **Expected:** A request to `/api/tax-details?ym=YYYY-MM&taxName=PIS&scenario=Venda` (or similar) should appear with a Status Code 200 (assuming the API route is working). The server terminal should show the logs from `/api/tax-details/route.ts`.
5.  Click on an **IPI Row**.
    *   **Expected:** A request to `/api/tax-details?ym=YYYY-MM&taxName=IPI&scenario=Venda` should appear.
6.  Click on an **Expense Row** (e.g., Salarios under Despesas Operacionais).
    *   **Expected:** A request to `/api/despesa-details?ym=YYYY-MM&...` should appear, demonstrating that expense clicks are still routed correctly.
7.  Click on a **Revenue/COGS Row** (e.g., Receita Bruta).
    *   **Expected:** The appropriate details API (likely `/api/nfe-details` or similar based on the parent `onCellClick` handler) should be called.

---

This PRD outlines the necessary changes within `PnLTable.tsx` to correctly identify tax rows and pass appropriate information to the parent click handler. Remember that the parent handler (`onCellClick`) will also need adjustment to utilize this new information (`kind: 'tax'`, `taxName`, `scenario`).

Let me know when you'd like to apply these changes.


---

# o4-mini comments:

The PRD you drafted is spot-on in identifying the root cause and prescribing the PnLTable changes needed to stop tax clicks from falling back into the “despesa‐details” flow. A few high-level comments and suggestions:

1. Cell-renderer logic  
   • You correctly replace the old `isLeaf`/`revMap` block with an `isTaxChild` test (regex + `taxIPI`) and tighten up the “button vs. span” logic with a single `isButtonClickable` guard.  
   • The parsing of `row.original.id` into `taxName` and `scenario` covers all known formats (`tax3_PIS_Venda`, `tax4_ICMS_ST_Devolucao`, plus the special `taxIPI`).  

2. Passing the right context  
   • By calling  
     ```js
     onCellClick({ ym, rowId, kind: 'tax', taxName, scenario })
     ```  
     you give the parent everything it needs to hit `/api/tax-details`.  

3. Parent handler adaptation (missing from PRD)  
   • You’ll also need to update the implementation of `onCellClick` (in `app/pnl/page.tsx` or wherever it lives) to do roughly:  
     ```ts
     function onCellClick(ctx: { ym: Month; rowId: string; kind?: string; taxName?:string; scenario?:string }) {
       if (ctx.kind === 'tax' && ctx.taxName && ctx.scenario) {
         return fetch(`/api/tax-details?ym=${ctx.ym}&taxName=${ctx.taxName}&scenario=${ctx.scenario}`)
       }
       // else if ctx.kind matches a revenue/cogs mapping → /api/nfe-details
       // else → /api/despesa-details
     }
     ```  
   • Make sure to update the TypeScript signature for that callback to include `taxName` and `scenario`.  

4. Edge-cases & sanity checks  
   • Double-check that `row.original.id` really is a simple string like `'1'|'2'|…` for the revMap entries; otherwise you may need to match on `row.original.id.startsWith('1')` etc.  
   • After you apply the PRD changes, step through the Network tab again—you should now see calls to `/api/tax-details?...` and the server logs in your Node.js terminal.  

In summary, the table-cell PRD is correct and necessary. To make it complete you’ll also need the corresponding parent‐handler changes (and type tweaks) so that when `kind === 'tax'` you actually call the new endpoint. Once you wire both sides up, your “tax” clicks will stop going to `/api/despesa-details` and everything will line up with the original PRD.
