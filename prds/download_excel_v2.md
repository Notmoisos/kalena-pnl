# Export "Current View" to Excel – PRD & TRD  
Version 2.0 | Author: AI Assistant | Date: 2025-05-26

---

## 1 — Overview
Enhance the existing "Download Excel" feature so that the file mirrors **exactly what the user is seeing** in the PnL table at the moment the button is clicked:

• If a parent row is expanded, its children appear in the file in the same order/indent.  
• Hidden (collapsed) rows are **omitted**.  
• Cells rendered as % in the UI are styled as percentage cells in Excel (`0.0%`).

---

## 2 — Goals & Success Criteria
G-1 Export reflects the visible rows (expanded/collapsed) and current column order.  
G-2 Percentages show as proper `%` cells; all other numeric cells can remain general numbers.  
G-3 Operation remains fully client-side and ≤ 1 s for ≤ 5 k visible rows.  
G-4 Existing tests updated; new tests cover percent formatting branch.

---

## 3 — Non-Goals
• Exporting filtered views (filter UI not yet present).  
• Pivoting or aggregating differently for Excel.

---

## 4 — User Story
> "As a finance analyst, when I drill into the table and press *Download Excel*, I expect the file to show exactly what I'm looking at, including any expanded breakdowns and percentage rows."

---

## 5 — Functional Requirements
FR-1 "Download Excel" button exports the React-Table *rowModel* after expansion is applied.  
FR-2 Each exported row keeps its indent level (prefix with spaces or extra column).  
FR-3 Columns have correct number formats:  
 • `%` rows → `0.0%`  
 • Other numeric cells → general number format  
FR-4 Root-only export fallback when no rows are expanded (current behaviour).  
FR-5 Unit test verifies that `buildExportMatrix()` outputs SheetJS cell objects with `t:'n', z:'0.0%'` for % cells.

---

## 6 — Technical Requirements (TRD)

### 6.1 Key Design
```
PnlPage ➜ PnLTable (holds react-table instance)
        │
        ├── useExport(ref)  // exposes buildExportMatrix()
        │
        └── Export button calls ref.current.export()
```

### 6.2 Implementation Details
1. **Expose the table instance**  
   ```tsx
   // inside PnLTable
   export type PnLTableHandle = { buildExportMatrix(): Cell[][] }
   export default forwardRef<PnLTableHandle>(function PnLTable(props, ref) {
     // ...existing table...
     useImperativeHandle(ref, () => ({ buildExportMatrix }));
   });
   ```

2. **Collect only visible rows**  
   ```ts
   const buildExportMatrix = () => {
     const headers = visibleCols.map(c => c.header);
     const body = table.getRowModel().rows.map(r => {
       const indent = ' '.repeat(r.depth * 2);
       return visibleCols.map(c => formatCell(r, c, indent));
     });
     return [headers, ...body];
   };
   ```

3. **Format cells with SheetJS cell objects**  
   ```ts
   function formatCell(row, col, indent) {
     const raw = col.id === 'label' ? indent + row.original.label
                                    : row.original.values[col.id];
     if (row.original.kind?.includes('percentage')) {
       return { v: raw / 100, t: 'n', z: '0.0%' };  // SheetJS expects 0-1
     }
     if (typeof raw === 'number') {
       return { v: raw, t: 'n', z: '#,##0.00' };
     }
     return { v: raw, t: 's' };
   }
   ```

4. **Generate workbook** (utility stays in `exportToExcel.ts`):
   ```ts
   export const exportToExcel = (matrix, fileName='PNL.xlsx') => {
     const ws = utils.aoa_to_sheet(matrix);
     const wb = utils.book_new();
     utils.book_append_sheet(wb, ws, 'PnL');
     writeFileXLSX(wb, fileName, { compression:true });
   };
   ```

5. **Button wiring in page**  
   ```tsx
   const tableRef = useRef<PnLTableHandle>(null);
   <PnLTable ref={tableRef} .../>
   <Button onClick={()=>{
       const mx = tableRef.current?.buildExportMatrix();
       if (mx) exportToExcel(mx);
   }}>Download Excel</Button>
   ```

### 6.3 Data Types
```
type Cell = string | number | { v:any; t:'n'|'s'; z?:string };
type Matrix = Cell[][];
```

---

## 7 — Step-by-Step Implementation

| # | Step | Action |
|---|------|--------|
| 1 | Refactor `exportToExcel.ts` to accept **matrix** not rows, keep existing helper for tests. |
| 2 | In `PnLTable.tsx`, wrap component with `forwardRef` + `useImperativeHandle`. |
| 3 | Implement `buildExportMatrix()` using `table.getRowModel()` and `formatCell()`. |
| 4 | Add `indent` logic: label column gets `'  '`×depth prefix. |
| 5 | Update page: hold `tableRef`, call `exportToExcel(matrix)`. |
| 6 | Unit tests: `buildExportMatrix()` ➜ visible rows only; % rows carry `z:'0.0%'`. |
| 7 | Manual QA: expand a few nodes, download; verify in Excel. |
| 8 | Docs: update `docs/pnl-export.md` usage section. |
| 9 | Feature flag cleanup (if still present). |

---

## 8 — Risks & Mitigations
R-1 Large matrices → memory spike. Mitigate by early return of **visible** rows only.  
R-2 Percent rows >10 k may lose precision → keep one decimal (`0.0%`).  
R-3 Nested depth exceeds indent readability → revisit if > 8 levels.

---

## 9 — Acceptance Criteria Checklist
☐ File shows only rows currently on-screen (expand state respected).  
☐ % cells show as % in Excel (inspect number format).  
☐ Other numeric cells exported as plain numbers.  
☐ Unit tests pass.  
☐ No regression to existing root-only export.

---

### Ready for implementation ✅
