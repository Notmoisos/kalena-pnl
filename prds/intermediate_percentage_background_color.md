# PRD: Match Sub‐Group Percentage Rows to Sub‐Group Background

## 🧐 Context & Goal

The “detailPercentage” rows we injected under **2.07 + Operacionais** currently render with the default white background. We want them to share the same light-blue sub-group background (`bg-[#e3e6f1]`) as their sibling sub-category rows.

---

## 📂 Affected File

- `pnl-matrix/components/PnLTable.tsx`

---

## 🛠 Step-by-Step Changes

### 1. Locate the `<tr>` className block

In `PnLTable.tsx`, find the row-rendering section (around line 300):

```tsx
<tbody>
  {table.getRowModel().rows.map((row) => (
    <tr
      key={row.id}
      className={clsx(
        'border-b last:border-0',
        row.original.kind === 'family'  && 'bg-emerald-50',
        row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
        (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white',
        !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]'
      )}
    >
```

---

### 2. Add a clause for sub-group detail percentages

Immediately before (or after) the final `!row.original.kind` clause, insert:

```diff
      className={clsx(
        'border-b last:border-0',
        row.original.kind === 'family'  && 'bg-emerald-50',
        row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
        (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white',
+       row.original.kind === 'detailPercentage' && row.depth > 0 && 'bg-[#e3e6f1]',
        !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]'
      )}
```

- `row.original.kind === 'detailPercentage' && row.depth > 0`  
  ensures only the in-subgroup percentage rows (depth > 0) pick up `bg-[#e3e6f1]`.

---

## ✅ After Applying

- When you expand **2.07 + Operacionais**, each sub-category’s percentage row now shares its light-blue background.
- All other rows (root, taxes, margins, etc.) keep their existing styling.
- No change to click behavior or data logic.