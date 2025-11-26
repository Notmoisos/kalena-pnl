# PRD / TRD – Hard-coded Adjustments for “Impostos sobre receita” (tax3) & “Impostos ST” (tax4)  
_🔄 2025-01 only – served by `/api/pnl`_

---

## 1. Background / Motivation
For January 2025 the tax data recovered from BigQuery is incomplete.  
To keep dashboards reliable we will inject **fixed deltas** into the P&L tree that the main `/api/pnl` endpoint returns.  
The deltas must surface:

* at **high level** (rows `tax3` and `tax4`)  
* at **child level** (e.g. `tax3_Cofins_Bonificacao`, `tax4_ICMS_ST_Devolucao`)  

The JSON shape must match existing rows so that the UI continues to expand/collapse without changes.

---

## 2. Current flow (excerpt)

```
GET /api/pnl?year=2025
 └─ buildPnl(year)
     └─ pivotRevenueLines(year)
          ├─ pivotRevenueTaxes(year)   // ⬅ builds tax3 subtree
          │     └─ fetchRevenueTaxRows (SQL)
          └─ pivotStTaxes(year)        // ⬅ builds tax4 subtree
                └─ fetchStTaxRows (SQL)
```

`pivotRevenueTaxes` and `pivotStTaxes` each:

1. build a `root` node (`id: tax3 | tax4`)
2. iterate the SQL rows, populating a `map<string, PnLNode>` of children  
3. return `[root, ...children]`

---

## 3. Data to inject

```ts
// tax3 – Impostos sobre receita
{ id:'tax3_Cofins'              , ym:'2025-01', valor:+10528.22 }
{ id:'tax3_Cofins_Bonificacao'  , ym:'2025-01', valor:+51.98   }

// tax4 – Impostos ST
{ id:'tax4_ICMS_ST'             , ym:'2025-01', valor:+10029.68 }
{ id:'tax4_ICMS_ST_Devolucao'   , ym:'2025-01', valor:-999.65  }
```

Root totals must automatically include the deltas so UI subtotals stay coherent.

---

## 4. High-level design

1. **Centralise deltas**  
   • Create `lib/taxExtras2025.ts` exporting two arrays `extraTax3Rows` & `extraTax4Rows` (typed as `ExtraTaxRow`).  
2. **Hook point** – augment **after** SQL fetch, **before** nodes are returned.  
   • safest/least-intrusive: patch `pivotRevenueTaxes` & `pivotStTaxes`.  
3. **Update root sums** – when a delta touches an existing child, update its value; otherwise create a new child. Always add its `valor` to `root.values['2025-01']`.

_Why not touch SQL?_ – keeps prod query logic immutable and confines hacks to 2025 only.

---

## 5. Step-by-step implementation

### Step 0 – Types

```ts
// lib/taxExtras2025.ts
export interface ExtraTaxRow {
  id   : string;     // e.g. tax3_Cofins
  label: string;     // “Cofins”
  sign : '+' | '-';  // keep current behaviour
  valor: number;
}
```

### Step 1 – Hard-code lists

```ts
// lib/taxExtras2025.ts
export const extraTax3Rows: ExtraTaxRow[] = [
  { id:'tax3_Cofins',             label:'Cofins',               sign:'+',
    valor: 10528.22 },
  { id:'tax3_Cofins_Bonificacao', label:'Cofins Bonificacao',   sign:'+',
    valor:    51.98 },
];

export const extraTax4Rows: ExtraTaxRow[] = [
  { id:'tax4_ICMS_ST',           label:'ICMS_ST',             sign:'+',
    valor: 10029.68 },
  { id:'tax4_ICMS_ST_Devolucao', label:'ICMS_ST Devolucao',  sign:'+',
    valor:  -999.65 },
];
```

### Step 2 – Patch `pivotRevenueTaxes`

```ts
// lib/pnlLogic.ts
import { extraTax3Rows } from './taxExtras2025';
// ... existing code ...

async function pivotRevenueTaxes(year: number) {
  const raw = await fetchRevenueTaxRows(year);
  const nodes = buildTaxTree(raw, 'tax3', 'Impostos sobre receita');

  // 🔧 inject extras for 2025-01
  if (year === 2025) mergeTaxExtras(nodes, extraTax3Rows);
  return nodes;
}
```

### Step 3 – Patch `pivotStTaxes`

```ts
import { extraTax4Rows } from './taxExtras2025';

async function pivotStTaxes(year: number) {
  const raw = await fetchStTaxRows(year);
  const nodes = buildTaxTree(raw, 'tax4', 'Impostos ST');

  if (year === 2025) mergeTaxExtras(nodes, extraTax4Rows);
  return nodes;
}
```

### Step 4 – Shared merge helper

```ts
function mergeTaxExtras(nodes: PnLNode[], extras: ExtraTaxRow[]) {
  const root = nodes.find(n => n.parentId === undefined)!; // tax3 or tax4
  const monthKey = '2025-01' as Month;

  for (const x of extras) {
    let child = nodes.find(n => n.id === x.id);
    if (!child) {
      child = {
        id: x.id,
        parentId: root.id,
        label: x.label,
        sign: x.sign,
        values: emptyYear(2025),
      };
      nodes.push(child);
    }
    child.values[monthKey] += x.valor;
    root.values[monthKey] += x.valor;
  }
}
```

### Step 5 – Update high-level bumps (NONE)  
Root totals are now auto-consistent; no extra bump in `pivotRevenueLines` needed.

### Step 6 – Unit / integration tests

1. `/api/pnl?year=2025` should contain:
   * child row `tax3_Cofins` = +10 528.22  
   * root `tax3` increased accordingly  
2. Same for `tax4` rows.

### Step 7 – Documentation

Add comment header in `taxExtras2025.ts` with expiry notice (remove when 2025-01 BigQuery is fixed).

---

## 6. Roll-out / Roll-back

* **Roll-out** – ship as normal; UI auto-refresh shows corrected numbers.  
* **Roll-back** – delete `taxExtras2025.ts` import lines & helper calls; deltas disappear.

---

## 7. Out of scope

* SQL back-fill of 2025-01 taxes.  
* Deltas for months other than 2025-01.  
* Any UI changes (tree already handles new rows).

---

## 8. Future-proofing

If more “fix-ups” are needed, create sibling files `taxExtras<yyyymm>.ts` and extend `mergeTaxExtras` with a lookup table to keep logic declarative.

---

### 📌  Implementation is self-contained to `lib/` and does **not** touch any API routes or UI code.