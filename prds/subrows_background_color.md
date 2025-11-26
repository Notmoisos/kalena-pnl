
Okay, here's the PRD to add the background color change for expanded sub-rows.

---

# PRD ▸ Style Expanded Sub-Rows

**Goal:** Apply a distinct background color (`#d1d5e8`) to sub-rows (children) when their parent row is expanded, to visually differentiate them from root-level rows. Intermediate rows should retain their existing styling.

**Solution:** Modify the `className` logic for the table row (`<tr>`) element in `PnLTable.tsx` to conditionally apply the new background color based on the row's depth, while ensuring intermediate row styling takes precedence.

---

## 1. `components/PnLTable.tsx` - Styling Changes

### 1.1 Modify `<tr>` className Logic

Locate the `<tbody>` section where rows are mapped and update the `className` assignment for the `<tr>` element:

```diff
 // components/PnLTable.tsx

 // ... inside the return statement ...
 <tbody>
   {table.getRowModel().rows.map((row) => (
     <tr
       key={row.id}
-      className={clsx(
-        'border-b last:border-0',
-        (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white'
-      )}
+      className={clsx(
+        'border-b last:border-0', // Base classes
+        // Apply intermediate styling first if present
+        (row.original.kind === 'intermediate' || row.original.kind === 'percentage')
+          ? 'bg-blue-900 text-white'
+          // Otherwise, apply sub-row styling if depth > 0
+          : row.depth > 0 && 'bg-[#d1d5e8]' // Target sub-rows using depth
+      )}
     >
       {row.getVisibleCells().map((cell) => (
         <td
           key={cell.id}
           className={clsx('px-2 py-1', (cell.column.columnDef.meta && (cell.column.columnDef.meta as any).numeric) ? 'text-right' : undefined)}
         >
           {flexRender(cell.column.columnDef.cell, cell.getContext())}
         </td>
       ))}
     </tr>
   ))}
 </tbody>
 // ...
```

**Explanation:**

*   We use a ternary operator within `clsx`.
*   **Priority 1:** If the row is an intermediate or percentage row (`row.original.kind` is set), it gets the `bg-blue-900 text-white` classes.
*   **Priority 2:** If it's *not* an intermediate row, we check `row.depth`. If `row.depth > 0`, it means it's a sub-row (child), and we apply the `bg-[#d1d5e8]` class. Tailwind's arbitrary value syntax `[...]` is used for the specific hex color.
*   **Default:** If it's a root row (`depth: 0`) and not intermediate, only the base `border-b last:border-0` classes apply.

---

## 2. Logic/Data Changes (`lib/pnlLogic.ts`)

✅ **None required.** This is purely a display change handled in the table component.

---

## 3. Validation Checklist

1.  **Expand:** Expand a row that has children (e.g., "Impostos sobre receita", "2.07 + Operacionais").
2.  **Sub-Row Styling:** Verify that the child rows appearing underneath now have the light purplish-blue background (`#d1d5e8`).
3.  **Root Row Styling:** Verify that the root rows (like "Receita Bruta", "CPV", etc.) retain their default white background.
4.  **Intermediate Row Styling:** Verify that intermediate rows ("Receita Líquida", "Lucro Bruto", "EBITDA", etc.) *still* have their dark blue background and white text, regardless of whether their parent (if they had one) is expanded.
5.  **Interaction:** Expanding/collapsing rows should correctly show/hide children with the appropriate background colors.

---

Apply this single change to `PnLTable.tsx`, and your expanded sub-rows will have the desired background color.


---

## o4-mini comments

The PRD is crisp and covers exactly the one change you need—no logic tweaks, just a single edit in your table component. A couple of very small refinements you might consider:

1.  **Guard against intermediate rows getting the sub-row color**  
    Right now the diff reads:
    ```tsx
    className={clsx(
      'border-b last:border-0',
      (row.original.kind==='intermediate' || row.original.kind==='percentage')
        ? 'bg-blue-900 text-white'
        : row.depth>0 && 'bg-[#d1d5e8]'
    )}
    ```
    ✓ Works as intended, but you could make it even clearer/readable:
    ```tsx
    className={clsx(
      'border-b last:border-0',
      row.original.kind && 'bg-blue-900 text-white',      // any intermediate
      !row.original.kind && row.depth>0 && 'bg-[#d1d5e8]'  // only true children
    )}
    ```
    That way you separate “intermediate vs. percentage” from “any other row with children.”

2.  **Tailwind JIT and the arbitrary color**  
    You’re using `bg-[#d1d5e8]` which is fine, but make sure it’s not purged. If you run into missing-class issues, add it to your safelist:
    ```js
    // tailwind.config.js
    module.exports = {
      purge: {
        /*…*/,
        options: { safelist: ['bg-[#d1d5e8]'] }
      }
    }
    ```

3.  **Behavior on multiple depths**  
    `row.depth>0` catches *all* descendants. If, someday, you introduce a 3rd nesting level and only want to style level-1 children, you can check `row.depth === 1` instead.

Aside from those tiny polish points, the PRD is correct and complete: one diff in `PnLTable.tsx` and you’ll get exactly the behavior you described.

