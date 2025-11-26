# PRD — “Descontos Financeiros” Family Drill-Down  
_last update • yyyy-mm-dd_

This document builds upon the existing family drill-down for **Receita Bruta** (row 1) and **Devoluções** (row 2).  
We will now add the same feature to **row 5 – Descontos Financeiros**.

─────────────────────────────────────────────────────────────────────────────
## 1 Goal
By clicking the chevron on row **5**, users see a sub-table that shows **Desconto value per `descricao_familia` for every month** of the selected year.  
The month-cells of row 5 must stay clickable (they still open the *Desconto* NFe modal).

─────────────────────────────────────────────────────────────────────────────
## 2 Files & high-level impact
| Step | File | Purpose |
|------|------|---------|
| 2.1 | `lib/nfeFamily.ts`              | Support new family kind `'Desconto'` |
| 2.2 | `app/api/nfe-details/route.ts`  | Allow `breakdown=family&kind=Desconto` |
| 2.3 | `components/PnLTable.tsx`       | UI state + expander logic for row `5` |
| 2.4 | (optional) tests / storybook    | Snapshot & SQL unit test |

─────────────────────────────────────────────────────────────────────────────
## 3 Detailed changes

### 2.1 `lib/nfeFamily.ts` — extend helper

```ts
// ... existing code ...
export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto';   // +Desconto

export async function fetchFamilyDetails (
  year : string,
  kind : FamilyKind = 'ReceitaBruta'
): Promise<FamilyApiRow[]> {

  let filter   = '';
  let selector = 'parsed_total_product_value + parsed_frete_value';

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
                AND SAFE_CAST(parsed_discount_value AS FLOAT64) > 0`;
      selector = 'parsed_discount_value';        // value column for discounts
      break;

    default:
      throw new Error('Unsupported kind');
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

### 2.2 `app/api/nfe-details/route.ts` — accept Desconto

```ts
// ... existing imports ...
import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily';
// ...

if (breakdown === 'family') {
  if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 });
  if (!['ReceitaBruta','Devolucao','Desconto'].includes(kind))
    return NextResponse.json({ error: 'unsupported kind' }, { status: 400 });
  return NextResponse.json(await fetchFamilyDetails(year, kind as FamilyKind));
}
```

---

### 2.3 `components/PnLTable.tsx` — UI

1. **Expander logic** – recognise row 5:

```tsx
const isGrossRow    = row.original.id === '1';
const isReturnsRow  = row.original.id === '2';
const isDiscountRow = row.original.id === '5';
const cacheKey      = `${row.original.id}_${year}`;

if ((isGrossRow || isReturnsRow || isDiscountRow) && !familyData[cacheKey] && !loadingMap[cacheKey]) {
  // ...
  const kind = isGrossRow ? 'ReceitaBruta'
             : isReturnsRow ? 'Devolucao'
             : 'Desconto';
  const res  = await fetch(`/api/nfe-details?year=${year}&kind=${kind}&breakdown=family`);
  // ...
}
```

2. **Row expandability**

```tsx
getRowCanExpand: (r) =>
  ['1','2','5'].includes(r.original.id) || (childMap[r.original.id]?.length ?? 0) > 0,
```

3. **`getSubRows`**

```tsx
if (['1','2','5'].includes(n.id)) {
  if (loadingMap[cacheKey]) return [{
    id: `loading_${cacheKey}`,
    parentId: n.id,
    label: 'Carregando…',
    values: {} as Record<Month, number>,
    kind: 'loading'
  } as Node];
  return familyData[cacheKey] ?? [];
}
```

4. **Month-cell clickability**  
Row 5 is already in `revMap`; leave it there so its cells keep opening the *Desconto* NFe modal.

_No changes to styling logic: the green “family” rows and grey “loading” rows work for any parent._

---

### 2.4 Tests / Storybook (optional)

* Story: show Descontos expanded.
* Unit test: SQL builder returns positive numbers for discounts.

─────────────────────────────────────────────────────────────────────────────
## 4 Roll-out / validation checklist

1. Deploy to staging with correct env vars.  
2. Load `/pnl?year=2024`, click chevron on row 5 → family sub-rows appear.  
3. Month-cells in row 5 still open the *Desconto* modal.  
4. Existing drill-downs for rows 1 and 2 still work.  
5. Basic perf / scroll tests.

─────────────────────────────────────────────────────────────────────────────
## 5 Future extensions
* Same approach for CPV rows (`kind=CPV`, etc.).
* Persist expanded state across year changes.

─────────────────────────────────────────────────────────────────────────────
### ✅  After these steps, Descontos Financeiros supports the same family drill-down without disrupting any existing behaviour.
