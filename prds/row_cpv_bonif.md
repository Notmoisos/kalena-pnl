
Okay, let's create the PRD for adding family drill-down to "CPV Bonificações e Amostras". This will follow the same successful pattern.

First, I need to confirm the exact data source and calculation for "CPV Bonificações e Amostras" to ensure the SQL in `fetchFamilyDetails` is correct. I'll look into `lib/nfeCosts.ts`.


Read file: pnl-matrix/lib/nfeCosts.ts
Okay, I've reviewed `lib/nfeCosts.ts`.

For `CPV_Boni` (CPV Bonificações e Amostras):
- The **filter** is `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'`.
- The **value selector** (amount) is `parsed_unit_cost*parsed_quantity_units`.

This confirms the approach. The row ID for "CPV Bonificações e Amostras" is indeed `'8'` as seen in `pivotCogsLines` in `pnlLogic.ts` which uses `kind==='CPV_Boni'` to map to id '8'.

Here's the PRD:

# PRD — “CPV Bonificações e Amostras” Family Drill-Down
_last update • yyyy-mm-dd_

This document builds upon existing family drill-downs. We will now add this feature to **row 8 – CPV Bonificações e Amostras**.

─────────────────────────────────────────────────────────────────────────────
## 1 Goal
Clicking the chevron on row **8 (CPV Bonificações e Amostras)** will display a sub-table of its value per `descricao_familia` for all months. Month-cells of row 8 must remain clickable, opening the existing COGS detail modal for "CPV_Boni".

─────────────────────────────────────────────────────────────────────────────
## 2 Files & high-level impact
| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/nfeFamily.ts`              | Add `CPV_Boni` to `FamilyKind`. Update SQL logic for `CPV_Boni`. |
| 2.2 | `app/api/cogs-details/route.ts` | Add `breakdown=family&kind=CPV_Boni` support. |
| 2.3 | `components/PnLTable.tsx`       | UI state + expander logic for row `8`. |
| 2.4 | (optional) tests / storybook    | Snapshot & SQL unit test for `CPV_Boni` family breakdown. |

─────────────────────────────────────────────────────────────────────────────
## 3 Detailed changes

### Step 2.1: Update Family Breakdown Logic

**File:** `pnl-matrix/lib/nfeFamily.ts`

```ts
// pnl-matrix/lib/nfeFamily.ts
// ... existing BigQuery setup & FamilyApiRow interface ...

-export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV';
+export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni'; // +CPV_Boni

export async function fetchFamilyDetails(
  year: string,
  kind: FamilyKind = 'ReceitaBruta'
): Promise<FamilyApiRow[]> {
  let filter = '';
  let selector = '';

  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
      selector = 'parsed_total_product_value + parsed_frete_value';
      break;

    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`;
      selector = 'parsed_total_product_value + parsed_frete_value';
      break;

    case 'Desconto':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')
                AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`;
      selector = 'parsed_desconto_proportional_value';
      break;

    case 'CPV':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;

+   case 'CPV_Boni': // +CPV_Boni case
+     filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
+               AND nome_cenario='Bonificação'`; // Specific filter for Bonificação
+     selector = 'parsed_unit_cost * parsed_quantity_units'; // Same selector as CPV
+     break;

    default:
      const exhaustiveCheck: never = kind;
      throw new Error(`Unsupported kind for family breakdown: ${exhaustiveCheck}`);
  }

  const sql = `
    SELECT
      descricao_familia AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
    LIMIT 500`;

  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as FamilyApiRow[];
}
```

---

### Step 2.2: Update API Endpoint for COGS Details

**File:** `pnl-matrix/app/api/cogs-details/route.ts`

```ts
// pnl-matrix/app/api/cogs-details/route.ts
// ... existing imports ...

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const year = p.get('year') ?? (ym ? ym.slice(0, 4) : '');
  const kind = p.get('kind') ?? '';
  const breakdown = p.get('breakdown');

  if (breakdown === 'family') {
    if (!year) {
      return NextResponse.json({ error: 'missing year for family breakdown' }, { status: 400 });
    }
-   if (kind === 'CPV') {
+   // Support CPV and CPV_Boni for family breakdown
+   if (kind === 'CPV' || kind === 'CPV_Boni') {
      const rows = await fetchFamilyDetails(year, kind as FamilyKind);
      return NextResponse.json(rows);
    } else {
      return NextResponse.json({ error: `Family breakdown not supported for COGS kind: ${kind}` }, { status: 400 });
    }
  }

  // Existing single month COGS item details logic
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !['CPV', 'CPV_Boni', 'Perdas', 'CPV_Devol'].includes(kind)) { // Ensure CPV_Boni is in this list if not already
    return NextResponse.json({ error: 'bad params for COGS item details' }, { status: 400 });
  }
  return NextResponse.json(await fetchCogsDetails(ym, kind as CogsKind));
}
```

---

### Step 2.3 `components/PnLTable.tsx` — UI Changes

1.  **Expander logic** – recognize row `8` (CPV Bonificações e Amostras):

    ```tsx
    // Inside cell: ({ row }: { row: any }) => { ... } for 'expander' column
    const isGrossRow    = row.original.id === '1';
    const isReturnsRow  = row.original.id === '2';
    const isDiscountRow = row.original.id === '5';
    const isCpvRow      = row.original.id === '7';
    const isCpvBoniRow  = row.original.id === '8'; // +CPV_Boni
    const cacheKey      = `${row.original.id}_${year}`;

    // ... in onClick={async () => { ... }}
    if ((isGrossRow || isReturnsRow || isDiscountRow || isCpvRow || isCpvBoniRow) && !familyData[cacheKey] && !loadingMap[cacheKey]) {
      setLoadingMap(p => ({ ...p, [cacheKey]: true }));
      try {
        let apiKind = '';
        let endpoint = '/api/nfe-details'; // Default endpoint

        if (isGrossRow) apiKind = 'ReceitaBruta';
        else if (isReturnsRow) apiKind = 'Devolucao';
        else if (isDiscountRow) apiKind = 'Desconto';
        else if (isCpvRow) {
          apiKind = 'CPV';
          endpoint = '/api/cogs-details';
        }
        else if (isCpvBoniRow) { // +CPV_Boni
          apiKind = 'CPV_Boni';
          endpoint = '/api/cogs-details';
        }

        const res  = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=family`);
        // ... rest of the fetch logic ...
      } finally {
        setLoadingMap(p => ({ ...p, [cacheKey]: false }));
      }
    }
    ```

2.  **Row expandability** – include row `8`:

    ```tsx
    // In useReactTable options
    getRowCanExpand: (r) =>
      ['1', '2', '5', '7', '8'].includes(r.original.id) || (childMap[r.original.id]?.length ?? 0) > 0,
    ```

3.  **`getSubRows`** – include row `8`:

    ```tsx
    // Callback for getSubRows
    if (['1', '2', '5', '7', '8'].includes(n.id)) { // +CPV_Boni
      if (loadingMap[cacheKey]) return [{ /* ...loading node... */ } as Node];
      return familyData[cacheKey] ?? [];
    }
    ```

4.  **Month-cell clickability (revMap/cogsMap):**
    Row `8` (CPV_Boni) is already in the COGS mapping in `PnLTable.tsx` (implicitly or explicitly via `fetchCogsDetails` logic) to trigger its existing detail modal. This remains unchanged.

---

### 2.4 Tests / Storybook (optional)

*   Story: Show CPV Bonificações e Amostras row expanded.
*   Unit Test:
    *   Verify `fetchFamilyDetails` with `kind: 'CPV_Boni'` uses the correct SQL filter and selector.
    *   Ensure `/api/cogs-details` handles `kind=CPV_Boni&breakdown=family`.

─────────────────────────────────────────────────────────────────────────────
## 4 Roll-out / validation checklist

1.  Deploy to staging.
2.  Load `/pnl?year=2024`, click chevron on row `8` → family sub-rows appear.
3.  Month-cells in row `8` must still open the existing COGS detail modal for "CPV_Boni".
4.  Existing drill-downs for rows `1`, `2`, `5`, and `7` must still work.
5.  Performance and UI checks.

─────────────────────────────────────────────────────────────────────────────
### ✅ After these steps, "CPV Bonificações e Amostras" will also support family drill-down.

### o4-mini comments



Ran tool
The PRD you drafted for adding the “CPV Bonificações e Amostras” drill‐down is spot‐on and aligns perfectly with the pattern you’ve used for the other rows. It covers the three pillars—type helper, API route, and UI wiring—plus a testing stanza. A couple of tiny pointers to make it 100% actionable:

1.  lib/nfeFamily.ts  
    • You added `CPV_Boni` to `FamilyKind` and the SQL filter/selector looks correct (`parsed_unit_cost * parsed_quantity_units` filtered by `nome_cenario='Bonificação'`).  
    • Double-check against `pivotCogsAggregates` in `lib/nfeCosts.ts` to confirm it matches the aggregation logic there.

2.  app/api/cogs-details/route.ts  
    • Be sure to explicitly import the family helper types:  
      ```ts
      import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily'
      ```  
    • The new `if (kind==='CPV'||kind==='CPV_Boni')` branch sits above the existing single‐month logic—good.  

3.  PnLTable.tsx  
    • You correctly add `isCpvBoniRow = id==='8'`, extend the chevron onClick to `/api/cogs-details?kind=CPV_Boni&breakdown=family`, and include '8' in both `getRowCanExpand` and `getSubRows`.  
    • Ensure you’ve still got the mapping in your revMap/cogsMap so that clicking the cell (not chevron) on row 8 opens the existing CPV_Boni modal.  

4.  Tests/Storybook  
    • Add a quick Storybook variant with row 8 expanded.  
    • Unit‐test the `CPV_Boni` SQL path in `fetchFamilyDetails`.

With those verifications, the PRD is complete and ready for implementation.
