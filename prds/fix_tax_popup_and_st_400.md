# PRD – Fix Tax‐Row Popup & 400-Error on "Impostos ST"

---

## Problem #1 (No popup)
- We now fetch `/api/tax-details` correctly, but `openDetailsModal` only logs the data.  There is no `TaxDetailsModal`, so nothing is rendered.

## Problem #2 (400 on ST sub-rows)
- Row-IDs for ST taxes are shaped like  
  `tax4_ICMS_ST_Venda`, `tax4_FCP_ST_Devolucao`, …  
- Current click-handler splits on "_" and naïvely takes  
  `parts[1]` = `ICMS`, `parts[2]` = `ST` as `scenario`.  
  The API receives `scenario=ST`, which is NOT in  
  `ALLOWED_SCENARIOS = ['Venda','Bonificacao','Devolucao']`, hence **HTTP 400**.

---

## Solution Overview
1. Robustly parse any `tax[3|4]_…` ID so that  
   taxName = everything between prefix and final segment  
   scenario = final segment ('Venda' | 'Bonificacao' | 'Devolucao')
   - Example: `tax4_ICMS_ST_Venda` → taxName=`ICMS_ST`, scenario=`Venda`

2. Add a full-screen modal (`TaxDetailsModal`) like the existing
   `NfeDetailsModal`/`DespesaDetailsModal`.
   - Shows columns: Produto | NF-es | Valor  
   - Shares Tailwind look & sticky header already used for other modals.

3. Wire the modal in `app/pnl/page.tsx`:
   - new React state `taxOpen`, `taxParams` ( {ym,taxName,scenario} )
   - `openDetailsModal` sets those instead of `console.log`.
   - Fetch happens inside the modal (consistent with the other two).

4. Cleanup:
   - Remove the temporary `.fetch()` call in `openDetailsModal`.
   - Update TypeScript types where `onCellClick` bubbles up
     (`taxName?`, `scenario?` already added).

---

## Step-by-Step Code Changes

### 1. PnLTable.tsx  (click parser)
- In the tax branch replace:

```ts
const parts = row.original.id.split('_');
if (parts.length >= 3) {
  taxName   = parts[1];
  scenario  = parts[2];
}
```

with:

```ts
const parts  = row.original.id.split('_');          // [ 'tax4', 'ICMS', 'ST', 'Venda' ]
scenario     = parts.at(-1) as 'Venda'|'Bonificacao'|'Devolucao';
taxName      = parts.slice(1, -1).join('_');        // 'ICMS_ST'
```

- Keep `taxIPI` special-case unchanged.  
- `isTaxChild` test can stay: `/^tax[34]_/.test(id) || id==='taxIPI'`.

### 2. New component `components/TaxDetailsModal.tsx`
- Props:
```ts
  open: boolean;
  params: null | { ym:string; taxName:string; scenario:'Venda'|'Bonificacao'|'Devolucao' };
  onClose: ()=>void;
```
- On mount/focus: fetch(`/api/tax-details?...`) and store rows.  
- Render a `<dialog>` identical to `NfeDetailsModal`, header
  "{taxName} – {scenario} – {ym}", body table: Produto | NF-es | Valor.
- Re-use helper `fmt` (currency) already in `NfeDetailsModal`.

### 3. page.tsx
- `const [taxOpen,setTaxOpen] = useState(false);`  
  `const [taxParams,setTaxParams] = useState< null | {ym:string;taxName:string;scenario:string} >(null);`

- In `openDetailsModal` replace the current `kind==='tax'` block with:

```ts
if (kind === 'tax' && taxName && scenario) {
  setTaxParams({ ym, taxName, scenario });
  setTaxOpen(true);
  return;
}
```

- Add the modal JSX:

```tsx
<TaxDetailsModal
  open={taxOpen}
  params={taxParams}
  onClose={() => setTaxOpen(false)}
/>
```

### 4. route validation (already correct)
- No change; once we pass `scenario=Venda`|`Bonificacao`|`Devolucao`
  the API returns 200.

### 5. Types
- `onCellClick` type already includes `taxName?` & `scenario?`.  
- Add `TaxDetail` interface (already in `lib/nfe.ts`) to modal file.

---

## Validation Checklist
1. Click "Cofins (Venda)" under "Impostos sobre receita" → popup opens, table appears.
2. Click "ICMS_ST (Venda)" under "Impostos ST" → API 200, modal shows rows.
3. Try "ICMS_ST (Devolução)" → correct negative totals, still shows.
4. Revenue / COGS / Despesa modals still work unchanged.
5. No console warnings, no 400s, and `fetchTaxDetails` logs appear for each click.

Once these pass, remove any leftover `console.log` debug lines. 


---

## o4-min comments

The PRD you’ve drafted nails the two root causes and lays out exactly the steps you need. A few quick sanity-checks and tiny adjustments before you dive into implementation:

1. Parsing logic in PnLTable  
   • You’ll want to completely replace the old `parts[1]`/`parts[2]` code with the slice-and-join approach so that any middle segments (`ICMS_ST`, `FCP_ST`, etc.) are preserved.  
   • If you’d rather avoid the new `Array.at()` API, you can fall back to  
     ```ts
     const scenario = parts[parts.length - 1];
     ```  
     but Next.js + modern browsers handle `at()` just fine.

2. TaxDetailsModal component  
   • Make sure to import your new `TaxDetailsModal` in `app/pnl/page.tsx` (you noted it in the PRD, but don’t forget the `import TaxDetailsModal from '@/components/TaxDetailsModal'`).  
   • Copy the structure of `NfeDetailsModal`: same `<dialog>` wrapper, sticky header, table columns “Produto | NF-es | Valor”.  
   • Pull in your `TaxDetail` type from `lib/nfe.ts` to type your fetched data.

3. Wiring in page.tsx  
   • After adding the two new `useState` hooks (`taxOpen` and `taxParams`), swap out your temporary `fetch()`+`console.log` in `openDetailsModal` for a `setTaxParams`/`setTaxOpen`.  
   • Then render `<TaxDetailsModal open={taxOpen} params={taxParams} onClose={() => setTaxOpen(false)} />` alongside the existing modals.

4. Cleanup & validation  
   • Remove any stray `console.log` or `fetch` calls in `openDetailsModal`.  
   • Double-check that `ALLOWED_SCENARIOS` still matches the values you’re passing (`'Venda'`, `'Bonificacao'`, `'Devolucao'`).  
   • After you’ve applied all of the above, exercise each branch (tax3 + tax4 + IPI + revenue + COGS + despesas) and confirm you never see the old `numero` query or any 400 “bad params” again.

Other than remembering that one import and actually **creating** the modal component file, your PRD is complete. Once you wire it all up, ST taxes will parse to `taxName='ICMS_ST'` & `scenario='Venda'` (etc.), the API will happily return grouped data, and your new popup will render exactly like the others.
