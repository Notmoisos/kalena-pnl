
Okay, this is a good next step! Adding family drill-down for CPV (Cost of Goods Sold) requires a similar pattern, but as you rightly pointed out, it involves the `/api/cogs-details` endpoint and likely different SQL logic.

Here's a PRD outlining the necessary changes:

# PRD — “CPV” Family Drill-Down
_last update • yyyy-mm-dd_

This document builds upon the existing family drill-downs for Receita Bruta (row 1), Devoluções (row 2), and Descontos Financeiros (row 5). We will now add the same feature to **row 7 – CPV**.

─────────────────────────────────────────────────────────────────────────────
## 1 Goal
By clicking the chevron on row **7 (CPV)**, users will see a sub-table showing CPV value per `descricao_familia` for every month of the selected year. The month-cells of row 7 must remain clickable, opening the existing CPV/COGS detail modal.

─────────────────────────────────────────────────────────────────────────────
## 2 Files & high-level impact
| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/nfeFamily.ts`              | Rename to `lib/familyBreakdown.ts` (or similar) and generalize. Add `CPV` to `FamilyKind`. Update SQL logic for CPV. |
| 2.2 | `app/api/cogs-details/route.ts` | Add `breakdown=family` support, calling the generalized family breakdown helper. (Create if it doesn't exist, or adapt if it does for single month details). |
| 2.3 | `components/PnLTable.tsx`       | UI state + expander logic for row `7`, calling the `/api/cogs-details` endpoint. |
| 2.4 | (optional) tests / storybook    | Snapshot & SQL unit test for CPV family breakdown. |

─────────────────────────────────────────────────────────────────────────────
## 3 Detailed changes

### Step 2.1: Generalize Family Breakdown Logic

**Rationale:** Since we're now fetching family details for different kinds (Revenue, Returns, Discounts, and now CPV) which might have slightly different SQL value selectors, it's a good time to make our family fetching logic more generic. We'll keep it in one place for now. If CPV logic diverges significantly later (e.g., different table source), we can split it.

**File:** `pnl-matrix/lib/nfeFamily.ts` (Consider renaming to `familyBreakdown.ts` or `itemFamilyBreakdown.ts` if it feels more appropriate, and update imports everywhere. For this PRD, we'll assume we're modifying `nfeFamily.ts` for simplicity of diffs).

```ts
// pnl-matrix/lib/nfeFamily.ts
// ... existing BigQuery setup ...

export interface FamilyApiRow {
  familia: string;
  ym: string;
  valor: number;
}

-export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto';
+export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV'; // +CPV

export async function fetchFamilyDetails(
  year: string,
  kind: FamilyKind = 'ReceitaBruta'
): Promise<FamilyApiRow[]> {
  let filter = '';
  let selector = ''; // Selector will now be more specific

  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
      selector = 'parsed_total_product_value + parsed_frete_value'; // Assuming frete is part of gross revenue
      break;

    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`;
      selector = 'parsed_total_product_value + parsed_frete_value'; // Assuming frete is part of returned value
      break;

    case 'Desconto':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')
                AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`; // User updated this field
      selector = 'parsed_desconto_proportional_value';
      break;

+   case 'CPV':
+     filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
+               AND (nome_cenario='Venda' OR nome_cenario='Inativo')`; // Base filter for sales
+     // CPV is often calculated as cost * quantity.
+     // This needs to match how overall CPV is calculated for row 7.
+     // Assuming 'parsed_unit_cost' and 'parsed_quantity_units' exist and are relevant.
+     selector = 'parsed_unit_cost * parsed_quantity_units';
+     break;

    default:
      // Optional: provide a more specific error or handle unknown kind gracefully
      const exhaustiveCheck: never = kind;
      throw new Error(`Unsupported kind for family breakdown: ${exhaustiveCheck}`);
  }

  const sql = `
    SELECT
      descricao_familia AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\` -- Assuming CPV data is in the same table
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
    LIMIT 500`;

  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as FamilyApiRow[];
}
```
**Important Note on CPV SQL:** The `selector` for CPV (`parsed_unit_cost * parsed_quantity_units`) is an assumption. You **must verify** this against your actual data schema and how CPV is calculated elsewhere in your application (e.g., in `lib/nfeCosts.ts` or similar) to ensure consistency. If `descricao_familia` is not available or reliable for costed items, this approach might need rethinking for CPV.

---

### Step 2.2: Update API Endpoint for COGS Details

**File:** `pnl-matrix/app/api/cogs-details/route.ts`

We need an API route that can serve CPV family breakdown. If `/api/cogs-details/route.ts` already exists and serves single-month CPV details (similar to how `nfe-details` worked), we'll adapt it. If it doesn't exist, we'll create it with the family breakdown logic.

**Assuming `cogs-details/route.ts` needs to be created or significantly adapted:**

```ts
// pnl-matrix/app/api/cogs-details/route.ts
import { NextResponse } from 'next/server';
import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily'; // Using the generalized helper
// If you have a specific helper for single month COGS details, import it too.
// import { fetchCogsItemDetails, CogsDetailKind } from '@/lib/nfeCosts'; // Example

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const year = p.get('year') ?? (ym ? ym.slice(0, 4) : '');
  const kind = p.get('kind') ?? ''; // e.g., 'CPV', 'CPV_Boni', etc.
  const breakdown = p.get('breakdown');

  // --- Family Breakdown Logic for COGS ---
  if (breakdown === 'family') {
    if (!year) {
      return NextResponse.json({ error: 'missing year for family breakdown' }, { status: 400 });
    }
    // Only support CPV for family breakdown for now, can be expanded
    if (kind === 'CPV') {
      const rows = await fetchFamilyDetails(year, kind as FamilyKind.CPV); // Explicitly 'CPV'
      return NextResponse.json(rows);
    } else {
      return NextResponse.json({ error: `Family breakdown not supported for COGS kind: ${kind}` }, { status: 400 });
    }
  }

  // --- Existing/Standard Single Month COGS Item Details Logic ---
  // This part depends on your existing implementation for COGS modals.
  // Example:
  // if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !['CPV', 'CPV_Boni' /* ...other COGS kinds */].includes(kind)) {
  //   return NextResponse.json({ error: 'bad params for COGS item details' }, { status: 400 });
  // }
  // const itemDetails = await fetchCogsItemDetails(ym, kind as CogsDetailKind);
  // return NextResponse.json(itemDetails);

  // If no specific logic matched (e.g., breakdown wasn't 'family' and no valid single-month params)
  return NextResponse.json({ error: 'Invalid request parameters for cogs-details' }, { status: 400 });
}
```
**Note:** If `/api/cogs-details/route.ts` already exists and is complex, carefully integrate the `breakdown=family` logic without disrupting its current functionality. The key is that a GET request with `?year=YYYY&kind=CPV&breakdown=family` should return the family breakdown data.

---

### Step 2.3 `components/PnLTable.tsx` — UI Changes

1.  **Expander logic** – recognize row `7` (CPV) and call the correct API:

    ```tsx
    // Inside cell: ({ row }: { row: any }) => { ... } for 'expander' column
    const isGrossRow    = row.original.id === '1';
    const isReturnsRow  = row.original.id === '2';
    const isDiscountRow = row.original.id === '5';
    const isCpvRow      = row.original.id === '7'; // +CPV
    const cacheKey      = `${row.original.id}_${year}`;

    // ... in onClick={async () => { ... }}
    if ((isGrossRow || isReturnsRow || isDiscountRow || isCpvRow) && !familyData[cacheKey] && !loadingMap[cacheKey]) {
      setLoadingMap(p => ({ ...p, [cacheKey]: true }));
      try {
        let apiKind = '';
        let endpoint = '/api/nfe-details'; // Default endpoint

        if (isGrossRow) apiKind = 'ReceitaBruta';
        else if (isReturnsRow) apiKind = 'Devolucao';
        else if (isDiscountRow) apiKind = 'Desconto';
        else if (isCpvRow) {
          apiKind = 'CPV';
          endpoint = '/api/cogs-details'; // Switch endpoint for CPV
        }

        const res  = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=family`);
        const rows = await res.json() as FamilyApiRow[];
        setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, row.original.id, months) }));
        setDataVersion(v => v + 1); // Optional
      } finally {
        setLoadingMap(p => ({ ...p, [cacheKey]: false }));
      }
    }
    ```

2.  **Row expandability** – include row `7`:

    ```tsx
    // In useReactTable options
    getRowCanExpand: (r) =>
      ['1', '2', '5', '7'].includes(r.original.id) || (childMap[r.original.id]?.length ?? 0) > 0,
    ```

3.  **`getSubRows`** – include row `7`:

    ```tsx
    // Callback for getSubRows
    if (['1', '2', '5', '7'].includes(n.id)) { // +CPV
      if (loadingMap[cacheKey]) return [{ /* ...loading node... */ } as Node];
      return familyData[cacheKey] ?? [];
    }
    ```

4.  **Month-cell clickability (revMap):**
    Row `7` (CPV) is already in `revMap` (or a similar map for COGS kinds) to trigger its existing detail modal. This should remain unchanged. The expander chevron provides the *new* family breakdown, while cell clicks retain their *original* modal behavior.

---

### 2.4 Tests / Storybook (optional)

*   Story: Add a story or update an existing one to show the CPV row expanded with its family data.
*   Unit Test:
    *   Verify `fetchFamilyDetails` with `kind: 'CPV'` constructs the correct SQL (especially the `selector` for CPV).
    *   Ensure the `/api/cogs-details` route handler correctly processes the `breakdown=family` parameter for CPV.

─────────────────────────────────────────────────────────────────────────────
## 4 Roll-out / validation checklist

1.  Deploy to staging with correct env vars.
2.  Load `/pnl?year=2024`, click the chevron on row `7` (CPV) → family sub-rows should appear, showing CPV values per family.
3.  Month-cells in row `7` must still open the existing CPV/COGS detail modal.
4.  Existing drill-downs and modal functionality for rows `1`, `2`, and `5` must still work correctly.
5.  Basic performance and UI (scrolling, layout) checks.

─────────────────────────────────────────────────────────────────────────────
## 5 Future extensions
*   Persist expanded state across year changes for all expandable rows.
*   Consider adding family breakdown to other relevant COGS lines (e.g., CPV Bonificações) if the data supports it.

─────────────────────────────────────────────────────────────────────────────
### ✅ After these steps, the CPV row will support family drill-down via its chevron, while month-cell clicks continue to trigger the existing COGS detail modal.


### o4 comments:

Overall the PRD is on-point: it covers the three big pillars (query helper, endpoint, UI wiring) and mirrors exactly what you did for Receita Bruta, Devoluções and Descontos. A few notes to make it 100% actionable:

1. Generalized helper  
 • You’ve surfaced `FamilyKind = 'CPV'` and a `selector = parsed_unit_cost * parsed_quantity_units`. _Make sure this matches exactly how your existing CPV totals are computed_ (e.g. compare to `pivotCogsAggregates` in `lib/nfeCosts.ts`).  
 • Double-check that `descricao_familia` is populated for COGS rows in BQ; if not, you may need a different join or table.

2. COGS API route  
 • Be explicit about importing the helper:  
   ```ts
   import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily'
   ```  
 • If you already have a single-month CPV handler in `/api/cogs-details`, slot the `breakdown=family` branch above it. Don’t accidentally override your existing “single-month CPV” logic.  
 • Return a 400 early for any other `kind` values (e.g. CPV_Boni, CPV_Devol) to avoid silent failures.

3. `PnLTable.tsx` wiring  
 • Ensure you’ve added `import { FamilyApiRow } from '@/lib/nfeFamily'` and the `Node` extension.  
 • In your revenue/COGS mapping object (`revMap` or equivalent), confirm that row 7 still maps to kind `'CPV'` so its month-cell clicks open the existing modal.  
 • The expander logic correctly handles `isCpvRow = row.id === '7'`, switches to `/api/cogs-details`, and uses the same `pivotFamilies` helper.  
 • `getRowCanExpand` and `getSubRows` now include `'7'` alongside `['1','2','5']`. Perfect.  
 • Your row-coloring and clickability rules don’t need tweaks—the green “family” styling and the fact that CPV families are non-clickable are inherited automatically.

4. Testing & validation  
 • Add a Storybook variant with the CPV row expanded, showing a few fake families.  
 • Unit-test the SQL snippet for `kind='CPV'`, ensuring the correct `selector` lands in the generated query.  
 • End-to-end: click the chevron on row 7 in the running app, confirm you get the family rows and that clicking any month cell still brings up the CPV detail modal.

With those verifications in place, you’ll have full parity of the “family drill-down” UX across all three parent rows.
