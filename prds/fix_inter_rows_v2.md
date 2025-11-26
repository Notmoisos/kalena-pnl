**Root causes you’re seeing**

1. **Despesa groups no longer expandable** – our updated `isLeaf` logic mistakenly treats **all root rows** as “leaf” when `row.original.kind` is undefined. That blocks TanStack’s expand arrow and click handler.
2. **Intermediate rows look normal** – we assigned `className` but never switched the table cell renderer from `fmt()` to the new `renderVal()` helper, so Tailwind classes aren’t applied and percentage formatting isn’t used.

Below is a **micro-patch PRD** that fixes both without touching formulas.

---

## File-by-file fixes

| # | File | Action |
|---|------|--------|
| 1 | `components/PnLTable.tsx` | **MODIFY** two small blocks |
| 2 | (none) | No other changes |

---

### 1 `components/PnLTable.tsx`

#### 1.1 Add the value formatter once, just above the `cols` definition

```ts
// helper so we can render % rows
const renderVal = (row: any, m: Month) => {
  const v = row.original.values[m] || 0;
  return row.original.kind === 'percentage'
    ? Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v / 100)
    : fmt(v);
};
```

#### 1.2 Replace the month-cell renderer with `renderVal`

```diff
- const value = fmt(row.original.values[m] || 0);
+ const value = renderVal(row, m);
```

#### 1.3 Correct the “isLeaf” detection and click rule

```diff
- const isLeaf = !row.getCanExpand() && row.original.kind !== 'intermediate' && row.original.kind !== 'percentage';
+ const isIntermediate = row.original.kind === 'intermediate' || row.original.kind === 'percentage';
+ const isLeaf = !row.getCanExpand() && !isIntermediate;
```

*(Intermediate rows stay non-expandable; true leaf rows remain clickable; group rows regain their ▶ arrow.)*

#### 1.4 Apply the row-level className (if not already)

```diff
- <tr key={row.id} className="border-b last:border-0">
+ <tr key={row.id} className={clsx('border-b last:border-0', row.original.className)}>
```

*(If you already have this line, leave it.)*

---

## Outcome

* **Group rows (e.g. “2.01 + Importação”, “2.03 + Despesas…”)** regain their caret and can expand/collapse again.
* **Intermediate rows** (“Receita Líquida”, “Margem %”, “EBITDA”, “Lucro Líquido”) show dark-blue background, white text, and percentages render as “93,1 %”.
* Click behaviour on true leaf rows (revenue, COGS, despesas) is unchanged.

Apply these three edits, refresh, and the P&L will have the intended styling and expandable behaviour.