
Read file: pnl-matrix/lib/nfeCosts.ts
Okay, after reviewing `lib/nfeCosts.ts`:

For `CPV_Devol` (CPV Devoluções):
- The **filter** is `finalidade='Devolução' AND cancelada='Não'`.
- The **value selector** is `parsed_unit_cost*parsed_quantity_units`.

The row ID for "CPV Devoluções" is `'10'`, based on `pivotCogsLines` in `pnlLogic.ts` mapping `kind==='CPV_Devol'` to id '10'.

Here's the PRD:

# PRD — “CPV Devoluções” Family Drill-Down
_last update • yyyy-mm-dd_

This document extends the family drill-down feature to **row 10 – CPV Devoluções**.

─────────────────────────────────────────────────────────────────────────────
## 1 Goal
Clicking the chevron on row **10 (CPV Devoluções)** will display its value per `descricao_familia` for all months. Month-cells of row 10 must remain clickable, opening the existing COGS detail modal for "CPV_Devol".

─────────────────────────────────────────────────────────────────────────────
## 2 Files & high-level impact
| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/nfeFamily.ts`              | Add `CPV_Devol` to `FamilyKind`. Update SQL logic for `CPV_Devol`. |
| 2.2 | `app/api/cogs-details/route.ts` | Add `breakdown=family&kind=CPV_Devol` support. |
| 2.3 | `components/PnLTable.tsx`       | UI state + expander logic for row `10`. |
| 2.4 | (optional) tests / storybook    | Snapshot & SQL unit test for `CPV_Devol` family breakdown. |

─────────────────────────────────────────────────────────────────────────────
## 3 Detailed changes

### Step 2.1: Update Family Breakdown Logic

**File:** `pnl-matrix/lib/nfeFamily.ts`

```ts
// pnl-matrix/lib/nfeFamily.ts
// ... existing BigQuery setup & FamilyApiRow interface ...

-export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas';
+export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas' | 'CPV_Devol'; // +CPV_Devol

export async function fetchFamilyDetails(
  year: string,
  kind: FamilyKind = 'ReceitaBruta'
): Promise<FamilyApiRow[]> {
  let filter = '';
  let selector = '';

  switch (kind) {
    // ... existing cases for ReceitaBruta, Devolucao, Desconto, CPV, CPV_Boni, Perdas ...

    case 'Perdas':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Baixa de estoque - Perda'`;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;

+   case 'CPV_Devol': // +CPV_Devol case
+     filter = `finalidade='Devolução' AND cancelada='Não'`; // Specific filter for CPV Devoluções
+     selector = 'parsed_unit_cost * parsed_quantity_units'; // Same selector as other CPVs
+     break;

    default:
      const exhaustiveCheck: never = kind;
      throw new Error(`Unsupported kind for family breakdown: ${exhaustiveCheck}`);
  }

  // ... rest of the SQL query and execution ...
}
```

---

### Step 2.2: Update API Endpoint for COGS Details

**File:** `pnl-matrix/app/api/cogs-details/route.ts`

```ts
// pnl-matrix/app/api/cogs-details/route.ts
// ... existing imports ...

export async function GET(req: Request) {
  // ... existing param extraction ...
  const breakdown = p.get('breakdown');

  if (breakdown === 'family') {
    if (!year) {
      return NextResponse.json({ error: 'missing year for family breakdown' }, { status: 400 });
    }
-   if (kind === 'CPV' || kind === 'CPV_Boni' || kind === 'Perdas') {
+   // Support CPV, CPV_Boni, Perdas, and CPV_Devol for family breakdown
+   if (kind === 'CPV' || kind === 'CPV_Boni' || kind === 'Perdas' || kind === 'CPV_Devol') {
      const rows = await fetchFamilyDetails(year, kind as FamilyKind);
      return NextResponse.json(rows);
    } else {
      return NextResponse.json({ error: `Family breakdown not supported for COGS kind: ${kind}` }, { status: 400 });
    }
  }

  // Existing single month COGS item details logic
  // Ensure 'CPV_Devol' is in this list if not already
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !['CPV', 'CPV_Boni', 'Perdas', 'CPV_Devol'].includes(kind)) {
    return NextResponse.json({ error: 'bad params for COGS item details' }, { status: 400 });
  }
  return NextResponse.json(await fetchCogsDetails(ym, kind as CogsKind));
}
```

---

### Step 2.3 `components/PnLTable.tsx` — UI Changes

1.  **Expander logic** – recognize row `10` (CPV Devoluções):

    ```tsx
    // Inside cell: ({ row }: { row: any }) => { ... } for 'expander' column
    // ... existing row type checks (isGrossRow, etc.) ...
    const isPerdasRow    = row.original.id === '9';
    const isCpvDevolRow = row.original.id === '10'; // +CPV_Devol
    const cacheKey      = `${row.original.id}_${year}`;

    // ... in onClick={async () => { ... }}
    if ((isGrossRow || isReturnsRow || isDiscountRow || isCpvRow || isCpvBoniRow || isPerdasRow || isCpvDevolRow) && !familyData[cacheKey] && !loadingMap[cacheKey]) {
      // ...
      try {
        // ... existing apiKind and endpoint logic ...
        else if (isPerdasRow) {
          apiKind = 'Perdas';
          endpoint = '/api/cogs-details';
        }
        else if (isCpvDevolRow) { // +CPV_Devol
          apiKind = 'CPV_Devol';
          endpoint = '/api/cogs-details';
        }
        // ... rest of the fetch logic ...
      }
      // ...
    }
    ```

2.  **Row expandability** – include row `10`:

    ```tsx
    // In useReactTable options
    getRowCanExpand: (r) =>
      ['1', '2', '5', '7', '8', '9', '10'].includes(r.original.id) || (childMap[r.original.id]?.length ?? 0) > 0,
    ```

3.  **`getSubRows`** – include row `10`:

    ```tsx
    // Callback for getSubRows
    if (['1', '2', '5', '7', '8', '9', '10'].includes(n.id)) { // +CPV_Devol
      // ...
    }
    ```

4.  **Month-cell clickability (revMap/cogsMap):**
    Row `10` (CPV_Devol) is already handled by the COGS mapping for its existing detail modal. This remains unchanged.

---

### 2.4 Tests / Storybook (optional)

*   Story: Show CPV Devoluções row expanded.
*   Unit Test:
    *   Verify `fetchFamilyDetails` with `kind: 'CPV_Devol'` uses the correct SQL.
    *   Ensure `/api/cogs-details` handles `kind=CPV_Devol&breakdown=family`.

─────────────────────────────────────────────────────────────────────────────
## 4 Roll-out / validation checklist

1.  Deploy to staging.
2.  Load `/pnl?year=2024`, click chevron on row `10` → family sub-rows appear.
3.  Month-cells in row `10` must still open the existing COGS detail modal for "CPV_Devol".
4.  Existing drill-downs for rows `1`, `2`, `5`, `7`, `8`, and `9` must still work.
5.  Performance and UI checks.

─────────────────────────────────────────────────────────────────────────────
### ✅ "CPV Devoluções" will now also support family drill-down.


### o4-mini comments



Ran tool
Your “CPV Devoluções” PRD is comprehensive and matches exactly the pattern we used for the other rows. It covers:

1. Type helper (`nfeFamily.ts`)  
  • Adds `CPV_Devol` to `FamilyKind`.  
  • Uses the same cost × quantity selector and the exact BQ filter for “Devolução”.  

2. API route (`cogs-details/route.ts`)  
  • Imports the family helper types.  
  • Adds a `breakdown=family` branch handling `CPV_Devol` alongside the other COGS kinds.  
  • Leaves the existing single‐month logic untouched.  

3. UI wiring (`PnLTable.tsx`)  
  • Defines `isCpvDevolRow = row.id==='10'`.  
  • Expander onClick now calls `/api/cogs-details?kind=CPV_Devol&breakdown=family`.  
  • `getRowCanExpand` and `getSubRows` include `'10'`.  
  • Month-cell clicks still use the existing `revMap`/`cogsMap` so the old CPV_Devol modal continues to work.  

4. Tests/storybook guidance  
  • Story to show row 10 expanded.  
  • Unit test of the SQL branch for `kind='CPV_Devol'`.  

Minor sanity checks before rollout:  
- Confirm your `CogsKind` union still includes `'CPV_Devol'`.  
- Ensure the SQL in `pivotCogsAggregates` (in `pnlLogic.ts`) uses the identical filter/selector.  
- Verify in `PnLTable` that row 10’s month‐cells remain wired to open the CPV_Devol modal.  

With those quick validations, the PRD is correct and ready for implementation.
