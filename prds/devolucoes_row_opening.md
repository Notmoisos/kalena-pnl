# PRD — “Devoluções / Returns” Family Drill-Down  
_last update • yyyy-mm-dd_

This document is **additive** to the existing Receita-Bruta drill-down feature.  
Steps reference the already-modified codebase.

─────────────────────────────────────────────────────────────────────────────
## 1 Goal
Enable a chevron on row **2 – Devoluções / Returns** that, when clicked, fetches and displays a sub-table broken down **by `descricao_familia` for every month of the selected year**.  
All other interactions—including the existing month-cell modal for Returns—must remain functional.

─────────────────────────────────────────────────────────────────────────────
## 2 Files & high-level impact
| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/nfeFamily.ts`              | Extend helper to support the “Devolucao” metric |
| 2.2 | `app/api/nfe-details/route.ts`  | Allow `breakdown=family&kind=Devolucao` |
| 2.3 | `components/PnLTable.tsx`       | UI state + expander logic for row `2` |
| 2.4 | (optional) tests / storybook    | Update snapshots, add unit test for new SQL pivot |

─────────────────────────────────────────────────────────────────────────────
## 3 Detailed changes

### 2.1 `lib/nfeFamily.ts` — extend helper

```ts
// ... existing imports & interface ...

export type FamilyKind = 'ReceitaBruta' | 'Devolucao'

export async function fetchFamilyDetails (
  year : string,
  kind : FamilyKind = 'ReceitaBruta'   // default for backward compat
): Promise<FamilyApiRow[]> {

  let filter   = '';
  let selector = 'parsed_total_product_value + parsed_frete_value';

  if (kind === 'ReceitaBruta') {
    filter = `
      tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
    selector = 'parsed_total_product_value + parsed_frete_value';
  } else if (kind === 'Devolucao') {
    filter = `
      finalidade='Devolução' AND cancelada='Não'`;
    selector = 'parsed_total_product_value + parsed_frete_value';
  } else {
    throw new Error('Unsupported kind for family breakdown');
  }

  const sql = `
    SELECT
      descricao_familia AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE
      ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
    LIMIT 500
  `;
  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as FamilyApiRow[];
}
```

---

### 2.2 `app/api/nfe-details/route.ts` — allow Devolucao family breakdown

```ts
import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily';
// ... existing code ...

if (breakdown === 'family') {
  if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 });
  if (kind !== 'ReceitaBruta' && kind !== 'Devolucao')
    return NextResponse.json({ error: 'unsupported kind' }, { status: 400 });
  return NextResponse.json(await fetchFamilyDetails(year, kind as FamilyKind));
}
```

---

### 2.3 `components/PnLTable.tsx` — UI logic for Devoluções

**a.** In the expander cell logic, allow row `2` (Devoluções) to expand and fetch family data:

```tsx
const isReturnsRow = row.original.id === '2';
const cacheKey = `${row.original.id}_${year}`;

<button
  onClick={async () => {
    row.toggleExpanded();
    if ((isGrossRow || isReturnsRow) && !familyData[cacheKey] && !loadingMap[cacheKey]) {
      setLoadingMap(p => ({ ...p, [cacheKey]: true }));
      try {
        const kind = isGrossRow ? 'ReceitaBruta' : 'Devolucao';
        const res  = await fetch(`/api/nfe-details?year=${year}&kind=${kind}&breakdown=family`);
        const rows = await res.json() as FamilyApiRow[];
        setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, row.original.id, months) }));
        setDataVersion(v => v + 1);
      } finally {
        setLoadingMap(p => ({ ...p, [cacheKey]: false }));
      }
    }
  }}
  // ... rest unchanged ...
>
  {row.getIsExpanded() ? '▼' : '▶'}
</button>
```

**b.** In `getRowCanExpand`, allow row `2`:

```tsx
getRowCanExpand: (r) => r.original.id === '1' || r.original.id === '2' || (childMap[r.original.id]?.length ?? 0) > 0,
```

**c.** In `getSubRows`, handle row `2`:

```tsx
const getSubRows = (n: Node) => {
  const cacheKey = `${n.id}_${year}`;
  if (n.id === '1' || n.id === '2') {
    if (loadingMap[cacheKey]) return [{ id:`loading_${cacheKey}`, parentId:n.id, label:'Carregando…', values:{} as Record<Month, number>, kind:'loading' } as Node];
    return familyData[cacheKey] ?? [];
  }
  return childMap[n.id] ?? [];
};
```

**d.** Row coloring and clickability logic remain unchanged (family rows are not clickable, modals for Devoluções month cells still work).

---

### 2.4 (Optional) Tests / Storybook

- Add/extend story to show Devoluções expanded with family rows.
- Add/extend unit test for `fetchFamilyDetails(year, 'Devolucao')` and for the new SQL.

---

## 4 Roll-out / validation checklist

1. Deploy to staging with BigQuery env vars available.
2. Load `/pnl?year=2024`, click chevron on Devoluções → green sub-rows appear.
3. Click any month of a **Despesas** leaf → Despesa modal still opens.
4. Click a month of row `1` (Receita Bruta) → family drilldown still works.
5. Click a month of row `2` (Devoluções) → NFe modal still opens (cell click).
6. Lighthouse or perf check: no blank reflows; table keeps horizontal scroll.

---

## 5 Future extensions (out of scope)

* Add same drill-down to CPV rows (`kind=CPV`, requires extra SQL).
* Provide grand-total line per family.
* Persist expanded state across year changes.

---

### ✅ With these adjustments, the Devoluções family drilldown will work identically to Receita Bruta, with all original modals and interactions preserved.
