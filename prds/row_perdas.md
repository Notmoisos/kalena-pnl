
Read file: pnl-matrix/lib/nfeCosts.ts
Alright, I've checked `lib/nfeCosts.ts` for "Perdas e Descartes."

- The **filter** is `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Baixa de estoque - Perda'`.
- The **value selector** is `parsed_unit_cost*parsed_quantity_units`.

The row ID for "Perdas e Descartes" is `'9'`, according to `pivotCogsLines` in `pnlLogic.ts` which maps `kind==='Perdas'` to id '9'.

Here’s the PRD:

# PRD — “Perdas e Descartes” Family Drill-Down
_last update • yyyy-mm-dd_

This document extends the family drill-down feature to **row 9 – Perdas e Descartes**.

─────────────────────────────────────────────────────────────────────────────
## 1 Goal
Clicking the chevron on row **9 (Perdas e Descartes)** will display its value per `descricao_familia` for all months. Month-cells of row 9 must remain clickable, opening the existing COGS detail modal for "Perdas".

─────────────────────────────────────────────────────────────────────────────
## 2 Files & high-level impact
| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/nfeFamily.ts`              | Add `Perdas` to `FamilyKind`. Update SQL logic for `Perdas`. |
| 2.2 | `app/api/cogs-details/route.ts` | Add `breakdown=family&kind=Perdas` support. |
| 2.3 | `components/PnLTable.tsx`       | UI state + expander logic for row `9`. |
| 2.4 | (optional) tests / storybook    | Snapshot & SQL unit test for `Perdas` family breakdown. |

─────────────────────────────────────────────────────────────────────────────
## 3 Detailed changes

### Step 2.1: Update Family Breakdown Logic

**File:** `pnl-matrix/lib/nfeFamily.ts`

```ts
// pnl-matrix/lib/nfeFamily.ts
// ... existing BigQuery setup & FamilyApiRow interface ...

-export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni';
+export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas'; // +Perdas

export async function fetchFamilyDetails(
  year: string,
  kind: FamilyKind = 'ReceitaBruta'
): Promise<FamilyApiRow[]> {
  let filter = '';
  let selector = '';

  switch (kind) {
    // ... existing cases for ReceitaBruta, Devolucao, Desconto, CPV, CPV_Boni ...

    case 'CPV_Boni':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Bonificação'`;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;

+   case 'Perdas': // +Perdas case
+     filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
+               AND nome_cenario='Baixa de estoque - Perda'`; // Specific filter for Perdas
+     selector = 'parsed_unit_cost * parsed_quantity_units'; // Same selector as CPV
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
-   if (kind === 'CPV' || kind === 'CPV_Boni') {
+   // Support CPV, CPV_Boni, and Perdas for family breakdown
+   if (kind === 'CPV' || kind === 'CPV_Boni' || kind === 'Perdas') {
      const rows = await fetchFamilyDetails(year, kind as FamilyKind);
      return NextResponse.json(rows);
    } else {
      return NextResponse.json({ error: `Family breakdown not supported for COGS kind: ${kind}` }, { status: 400 });
    }
  }

  // Existing single month COGS item details logic
  // Ensure 'Perdas' is in this list if not already
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !['CPV', 'CPV_Boni', 'Perdas', 'CPV_Devol'].includes(kind)) {
    return NextResponse.json({ error: 'bad params for COGS item details' }, { status: 400 });
  }
  return NextResponse.json(await fetchCogsDetails(ym, kind as CogsKind));
}
```

---

### Step 2.3 `components/PnLTable.tsx` — UI Changes

1.  **Expander logic** – recognize row `9` (Perdas e Descartes):

    ```tsx
    // Inside cell: ({ row }: { row: any }) => { ... } for 'expander' column
    // ... existing row type checks (isGrossRow, etc.) ...
    const isCpvBoniRow  = row.original.id === '8';
    const isPerdasRow   = row.original.id === '9'; // +Perdas
    const cacheKey      = `${row.original.id}_${year}`;

    // ... in onClick={async () => { ... }}
    if ((isGrossRow || isReturnsRow || isDiscountRow || isCpvRow || isCpvBoniRow || isPerdasRow) && !familyData[cacheKey] && !loadingMap[cacheKey]) {
      // ...
      try {
        // ... existing apiKind and endpoint logic ...
        else if (isCpvBoniRow) {
          apiKind = 'CPV_Boni';
          endpoint = '/api/cogs-details';
        }
        else if (isPerdasRow) { // +Perdas
          apiKind = 'Perdas';
          endpoint = '/api/cogs-details';
        }
        // ... rest of the fetch logic ...
      }
      // ...
    }
    ```

2.  **Row expandability** – include row `9`:

    ```tsx
    // In useReactTable options
    getRowCanExpand: (r) =>
      ['1', '2', '5', '7', '8', '9'].includes(r.original.id) || (childMap[r.original.id]?.length ?? 0) > 0,
    ```

3.  **`getSubRows`** – include row `9`:

    ```tsx
    // Callback for getSubRows
    if (['1', '2', '5', '7', '8', '9'].includes(n.id)) { // +Perdas
      // ...
    }
    ```

4.  **Month-cell clickability (revMap/cogsMap):**
    Row `9` (Perdas) is already handled by the COGS mapping for its existing detail modal. This remains unchanged.

---

### 2.4 Tests / Storybook (optional)

*   Story: Show Perdas e Descartes row expanded.
*   Unit Test:
    *   Verify `fetchFamilyDetails` with `kind: 'Perdas'` uses the correct SQL.
    *   Ensure `/api/cogs-details` handles `kind=Perdas&breakdown=family`.

─────────────────────────────────────────────────────────────────────────────
## 4 Roll-out / validation checklist

1.  Deploy to staging.
2.  Load `/pnl?year=2024`, click chevron on row `9` → family sub-rows appear.
3.  Month-cells in row `9` must still open the existing COGS detail modal for "Perdas".
4.  Existing drill-downs for rows `1`, `2`, `5`, `7`, and `8` must still work.
5.  Performance and UI checks.

─────────────────────────────────────────────────────────────────────────────
### ✅ "Perdas e Descartes" will now also support family drill-down.

### o4-mini comments


The PRD for “Perdas e Descartes” is right in line with the pattern you already have in place. It covers:

1. Extending the family‐helper (`nfeFamily.ts`) with a new `case 'Perdas'` that uses the same cost×quantity selector and the exact “Baixa de estoque – Perda” filter.  
2. Adding a `breakdown=family` branch in `/api/cogs-details` that handles both `CPV`/`CPV_Boni` and now `Perdas`, leaving the existing single‐month logic untouched.  
3. Wire-up in `PnLTable.tsx`:
   • `isPerdasRow = id === '9'`  
   • Calling `/api/cogs-details?kind=Perdas&breakdown=family` when its chevron is clicked  
   • Including `'9'` in both `getRowCanExpand` and `getSubRows`  
   • Leaving the month-cell click mapping in place so the original “Perdas” modal still works.

A couple of quick sanity checks before you roll it out:

• Confirm your `CogsKind` union already contains `'Perdas'` (it does).  
• Double-check the SQL in `pivotCogsAggregates` to ensure the same filter+selector combination is used there (for consistency).  
• Verify in `PnLTable` that your `cogsMap`/`revMap` still maps ID 9 into the Perdas modal path.

Beyond those verifications, the PRD is complete and ready to implement.
