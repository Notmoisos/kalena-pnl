
# PnL Export to Excel – PRD & TRD  
Version 1.0 | Author: AI Assistant | Date: 2025-05-26

---

## 1. Overview
Add a “Download Excel” button in the upper-right area of the PnL screen.  
When clicked, the button exports the **current, client-side state** of the PnL table to an `.xlsx` file and triggers a download in the browser.

---

## 2. Goals & Success Criteria
1. One-click export of the visible PnL rows/columns to Excel.  
2. File name pattern: `PNL_<YYYY-MM-DD_HH-mm>.xlsx`.  
3. Export completes < 1 s for ≤ 5 k rows on a modern laptop.  
4. Feature works on latest Chrome, Safari, Edge, Firefox.  
5. Unit test coverage ≥ 90 % for conversion utility.

---

## 3. Non-Goals
• Server-side generation, PDF export, or scheduling.  
• Persisting downloaded files on the backend.

---

## 4. User Story
> As a portfolio manager viewing my PnL, I want a button that instantly downloads what I’m seeing so I can share it with finance.

---

## 5. Functional Requirements
FR-1 Button is visible at all times while table is rendered.  
FR-2 Export uses **exactly** the data currently in React state (sorting, filters, hidden columns respected).  
FR-3 Download uses Excel MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.  
FR-4 No network traffic generated (entirely client-side).  
FR-5 Click feedback: disable button + spinner until file is ready (≤ 1 s).

---

## 6. Technical Requirements (TRD)

### 6.1 High-Level Design
```
[UI Button] --onClick--> exportToExcel(state.rows, state.columns)
                                 |
                                 v
                    SheetJS (xlsx) converts JSON -> workbook -> blob
                                 |
                                 v
                           triggerDownload(blob)
```

### 6.2 Key Decisions
• Use **SheetJS/xlsx** – battle-tested, tree-shakable (< 100 kB when properly imported).  
• Keep logic **pure**; no direct DOM scraping. We already own the state → just export it.  
• Re-use existing table column definitions for header labels.

### 6.3 Public API (internal module)
```ts
// src/utils/exportToExcel.ts
export interface ExportColumn {
  key: string;        // property in data row
  header: string;     // column label
  hidden?: boolean;
}

export function exportToExcel(rows: unknown[], cols: ExportColumn[],
                              fileName?: string): Promise<void>;
```

---

## 7. Step-by-Step Implementation

| # | Step | What to Do | Code Snippet |
|---|------|------------|--------------|
| 1 | Install dep | `npm i xlsx file-saver --save`<br>`npm i -D @types/file-saver` | — |
| 2 | Utility | Create `exportToExcel.ts` (API above).<br>Implementation: |
```ts
import { utils, writeFileXLSX } from 'xlsx';

export async function exportToExcel(rows, cols, name = '') {
  const visible = cols.filter(c => !c.hidden);
  const data = [
    visible.map(c => c.header),          // headers
    ...rows.map(r => visible.map(c => r[c.key])),
  ];
  const ws = utils.aoa_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'PnL');
  const stamp = new Date().toISOString().replace(/[T:]/g, '-').slice(0, 16);
  writeFileXLSX(wb, name || `PNL_${stamp}.xlsx`, { compression: true });
}
``` |
| 3 | UI Button | In PnL page header: | ```tsx
import { exportToExcel } from '@/utils/exportToExcel';

// ... existing code ...
<Button
  icon={<DownloadOutlined />}
  loading={isExporting}
  onClick={async () => {
    setExporting(true);
    try {
      await exportToExcel(rows, columns);
    } finally {
      setExporting(false);
    }
  }}
>
  Download Excel
</Button>
```
|
| 4 | Layout | Wrap header in `flex justify-between items-center` (Tailwind) or `display:flex;` CSS so button stays upper-right. | — |
| 5 | State Wiring | Ensure `rows` & `columns` come from the same React context/store that feeds the table; no ad-hoc queries. | — |
| 6 | Unit Tests | • Mock `writeFileXLSX` and assert it receives correct 2-D array.<br>• Edge cases: empty rows, hidden columns. | jest examples omitted |
| 7 | Lint & Build | `npm run lint && npm run test && npm run build` must pass. | — |
| 8 | Docs | Add SHORT note in README under “Data Export”. | — |

---

## 8. Risk & Mitigation
1. **Large tables** → memory spike. Mitigate by streaming? Not needed ≤ 10 k rows.  
2. **Locale date formatting** → use ISO stamp to avoid ambiguity.  
3. **Browser-compat** → SheetJS tested on evergreen browsers; if IE11 needed - polyfill (out of scope).

---

## 9. Rollout Plan
• Feature-flag behind `ENABLE_EXCEL_EXPORT` env for first release.  
• QA performs manual export on staging with 1 k, 5 k rows.  
• If metrics OK for 1 week, remove flag.

---

## 10. Appendix – Full Utility Example
```ts
// src/utils/exportToExcel.ts
import { utils, writeFileXLSX, WritingOptions } from 'xlsx';

export const exportToExcel = (
  rows: Record<string, any>[],
  cols: { key: string; header: string; hidden?: boolean }[],
  opts: { fileName?: string; writeOptions?: WritingOptions } = {}
) => {
  const visible = cols.filter(c => !c.hidden);
  const matrix = [
    visible.map(c => c.header),
    ...rows.map(r => visible.map(c => r[c.key])),
  ];
  const ws = utils.aoa_to_sheet(matrix);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'PnL');
  const ts = new Date().toISOString().replace(/[T:]/g, '-').slice(0, 16);
  writeFileXLSX(wb, opts.fileName || `PNL_${ts}.xlsx`, {
    compression: true,
    ...opts.writeOptions,
  });
};
```

---

### Done ✓
This document is ready to be added to your repo under `docs/pnl-export.md` and followed step-by-step.
