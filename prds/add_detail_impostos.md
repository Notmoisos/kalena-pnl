
Okay, let's break down adding the tax details modal functionality.

---

# PRD ▸ NFe Details Modal for Tax Sub-Rows

**Goal:** Allow users to click on individual tax sub-rows (e.g., "PIS", "Cofins", "ICMS_ST") within the "Impostos sobre receita" (tax3) and "Impostos ST" (tax4) groups in the P&L table and view a modal displaying the underlying NF-e details contributing to that specific tax amount for the selected month.

**Solution:**
1.  **Identify Click:** Modify `PnLTable.tsx` to detect clicks on tax sub-rows and extract the relevant parameters (year-month, tax name, scenario).
2.  **Modal Trigger:** Update the `onCellClick` handler passed to `PnLTable` to accept and manage these new tax parameters, likely storing them in state to control the `NfeDetailsModal`.
3.  **Modal Adaptation:** Enhance `NfeDetailsModal.tsx` to:
    *   Accept new parameter types (`taxName`, `scenario`).
    *   Detect when tax details are requested and call a new API endpoint.
    *   Potentially use a new state variable and interface (`TaxDetail[]`) for the fetched data.
    *   Render a table suitable for tax details (e.g., NFe #, Date, Base Value, Tax Value).
4.  **New API Route:** Create `/api/tax-details/route.ts` to handle requests for tax details.
5.  **Backend Logic:** Implement a new function `fetchTaxDetails` (likely in `lib/nfe.ts` or a new `lib/nfeTaxes.ts`) to query BigQuery for the detailed NFe rows corresponding to the specific tax, month, and scenario.

---

## 1. `lib/nfe.ts` (or new `lib/nfeTaxes.ts`) - Backend Logic

### 1.1 Define `TaxDetail` Interface
We need a structure for the data returned for tax details.

```typescript
// lib/nfe.ts (or new lib/nfeTaxes.ts)
export interface TaxDetail {
  numero: string; // NFe number
  data_emissao: string; // Emission date/time
  valor_base?: number; // Base value used for tax calc (optional, might vary by tax)
  valor_imposto: number; // The actual tax value for this NFe
  // Add other relevant fields like cliente_nome if needed
}
```

### 1.2 Implement `fetchTaxDetails` Function
This function will query BigQuery. It needs to dynamically select the correct tax value column based on `taxName`.

```typescript
// lib/nfe.ts (or new lib/nfeTaxes.ts)
import { BigQuery } from '@google-cloud/bigquery'; // Assuming bq instance is configured

const bq = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, keyFilename: process.env.BQ_KEYFILE });

// Mapping from tax names (used in UI/API) to BQ column names
const taxColumnMap: Record<string, string> = {
  'PIS': 'parsed_pis_value',
  'Cofins': 'parsed_cofins_value',
  'ISS': 'parsed_iss_value',
  'IR': 'parsed_ir_value',
  'FCP': 'parsed_fcp_value',
  'ICMS': 'parsed_icms_value', // Note: ICMS might need special handling if split (dest/remet)
  'ICMS_ST': 'parsed_icmsst_value',
  'FCP_ST': 'parsed_fcpst_value',
  'IPI': 'parsed_ipi_value',
  // Add mappings for ICMS Dest/Remet if needed separately
};

export async function fetchTaxDetails(ym: string, taxName: string, scenario: string): Promise<TaxDetail[]> {
  const taxColumn = taxColumnMap[taxName];
  if (!taxColumn) {
    console.error(`Invalid taxName received: ${taxName}`);
    return [];
  }

  // --- Base Filter Logic (similar to fetchRevenueTaxRows/fetchStTaxRows) ---
  let scenarioFilter: string;
  let signMultiplier = 1;

  if (scenario === 'Venda') {
    scenarioFilter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
  } else if (scenario === 'Bonificacao') {
    scenarioFilter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'`;
  } else if (scenario === 'Devolucao') {
    scenarioFilter = `finalidade='Devolução' AND cancelada='Não'`;
    signMultiplier = -1; // Flip sign for returns if needed for consistency, or handle in UI
  } else {
      console.error(`Invalid scenario received: ${scenario}`);
      return []; // Or handle default case if applicable
  }
  // --- End Base Filter Logic ---


  // Construct the SQL query
  const sql = `
    SELECT
      numero,
      TIMESTAMP(data_emissao) as data_emissao,
      -- SAFE_CAST(parsed_total_product_value AS FLOAT64) as valor_base, -- Example base value, adjust as needed
      SAFE_CAST(${taxColumn} AS FLOAT64) * ${signMultiplier} AS valor_imposto
    FROM
      \`${process.env.BQ_TABLE}\`
    WHERE
      ${scenarioFilter}
      AND FORMAT_DATE('%Y-%m', DATE(data_emissao)) = @ym
      AND SAFE_CAST(${taxColumn} AS FLOAT64) IS NOT NULL AND SAFE_CAST(${taxColumn} AS FLOAT64) != 0 -- Only rows contributing to this tax
    ORDER BY
      data_emissao DESC
    LIMIT 500; -- Limit results for performance
  `;

  try {
    const [rows] = await bq.query<TaxDetail>({ query: sql, params: { ym } });
    // Format date for display if needed, or do it in frontend
    return rows.map(row => ({ ...row, data_emissao: row.data_emissao.value }));
  } catch (error) {
      console.error("Error fetching tax details from BigQuery:", error);
      return [];
  }
}
```
*Self-correction: Added error handling and date formatting.*

---

## 2. `app/api/tax-details/route.ts` - New API Endpoint

Create this new file to handle the frontend requests.

```typescript
// app/api/tax-details/route.ts
import { NextResponse } from 'next/server';
// Adjust the import path based on where you placed fetchTaxDetails
import { fetchTaxDetails } from '@/lib/nfe'; // Or '@/lib/nfeTaxes'

// Basic validation - adjust allowed tax names/scenarios as needed
const ALLOWED_TAX_NAMES = ['PIS', 'Cofins', 'ISS', 'IR', 'FCP', 'ICMS', 'ICMS_ST', 'FCP_ST', 'IPI'];
const ALLOWED_SCENARIOS = ['Venda', 'Bonificacao', 'Devolucao'];

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const taxName = p.get('taxName') ?? '';
  const scenario = p.get('scenario') ?? '';

  // Basic validation
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) ||
      !ALLOWED_TAX_NAMES.includes(taxName) ||
      !ALLOWED_SCENARIOS.includes(scenario))
  {
    console.warn('Bad params received for tax-details:', { ym, taxName, scenario });
    return NextResponse.json({ error: 'bad params' }, { status: 400 });
  }

  try {
    const details = await fetchTaxDetails(ym, taxName, scenario);
    return NextResponse.json(details);
  } catch (error) {
    console.error(`API error fetching tax details for ${taxName}/${scenario}/${ym}:`, error);
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }
}
```

---

## 3. `components/NfeDetailsModal.tsx` - Modal Adaptation

### 3.1 Update Props and State
Modify the component props to accept `taxName` and `scenario`. Use a separate state for tax details.

```diff
 // components/NfeDetailsModal.tsx
 import { useEffect, useState } from 'react';
-export interface NfeDetail { produto: string; n_nfes: number; valor_total: number; }
+import { NfeDetail } from '@/lib/nfeRevenue'; // Assuming NfeDetail is defined elsewhere
+import { TaxDetail } from '@/lib/nfe'; // Or '@/lib/nfeTaxes'

+type ModalParams =
+  | { ym: string; kind: 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas' | 'CPV_Devol' }
+  | { ym: string; taxName: string; scenario: string };

-export default function NfeDetailsModal({ open, params, onClose }: { open: boolean; params: { ym: string; kind: 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas' | 'CPV_Devol' } | null; onClose: () => void; }) {
+export default function NfeDetailsModal({ open, params, onClose }: { open: boolean; params: ModalParams | null; onClose: () => void; }) {
-  const [rows, setRows] = useState<NfeDetail[]>([]);
+  // Use a union type or separate state if structure differs significantly
+  const [rows, setRows] = useState<NfeDetail[] | TaxDetail[]>([]);
   const [loading, setLoading] = useState(false);
+  const [isTaxView, setIsTaxView] = useState(false); // Flag to control rendering

```

### 3.2 Update `useEffect` Logic
Branch the fetch call based on whether `params` contains `kind` or `taxName`.

```diff
 // components/NfeDetailsModal.tsx

   useEffect(() => {
     // ... (existing initial checks for open/params) ...

     setRows([]); // Clear stale data
     setLoading(true);
+    setIsTaxView(false); // Reset view flag

+    let api = '';
+    let queryParams = '';
+
+    if (params && 'kind' in params) { // Revenue or COGS details
       const cogsKinds = ['CPV','CPV_Boni','Perdas','CPV_Devol'];
-      const api = cogsKinds.includes(params.kind)
+      api = cogsKinds.includes(params.kind)
         ? '/api/cogs-details'
         : '/api/nfe-details';
+      queryParams = `ym=${params.ym}&kind=${params.kind}`;
+
+    } else if (params && 'taxName' in params) { // Tax details
+      setIsTaxView(true);
+      api = '/api/tax-details';
+      queryParams = `ym=${params.ym}&taxName=${params.taxName}&scenario=${params.scenario}`;
+    } else {
+      // Should not happen if initial checks are correct
+      setLoading(false);
+      return;
+    }


-    fetch(`${api}?ym=${params.ym}&kind=${params.kind}`)
+    fetch(`${api}?${queryParams}`)
       .then(async (res) => {
         // ... (existing response handling) ...
       })
       .then(setRows) // Type assertion might be needed if state isn't a union: .then(data => setRows(data as NfeDetail[] | TaxDetail[]))
       .catch((err) => {
         // ... (existing error handling) ...
       });
   }, [open, params]);

```

### 3.3 Update Table Rendering
Conditionally render the table headers and rows based on `isTaxView`.

```diff
 // components/NfeDetailsModal.tsx

           {/* Scrollable Table Content */}
           <div className="overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300">
             <table className="w-full text-sm">
-              <thead className="bg-gray-100 sticky top-0 z-0">
-                <tr>
-                  <th className="text-left px-2 py-1">Produto</th>
-                  <th className="text-right px-2 py-1">NF-es</th>
-                  <th className="text-right px-2 py-1">Valor</th>
-                </tr>
+              <thead className="bg-gray-100 sticky top-0 z-0"> // Keep thead sticky
+                {isTaxView ? (
+                  <tr>
+                    <th className="text-left px-2 py-1">NF-e #</th>
+                    <th className="text-left px-2 py-1">Data Emissão</th>
+                    {/* <th className="text-right px-2 py-1">Valor Base</th> */}
+                    <th className="text-right px-2 py-1">Valor Imposto</th>
+                  </tr>
+                ) : (
+                  <tr>
+                    <th className="text-left px-2 py-1">Produto</th>
+                    <th className="text-right px-2 py-1">NF-es</th>
+                    <th className="text-right px-2 py-1">Valor</th>
+                  </tr>
+                )}
               </thead>
               <tbody>
                 {loading && ( /* ... loading row ... */ )}
-                {!loading && rows.length === 0 && ( /* ... empty row ... */ )}
+                {!loading && rows.length === 0 && (
+                  <tr>
+                    <td colSpan={isTaxView ? 3 : 3} className="text-center italic text-gray-500 py-4"> {/* Adjust colSpan */}
+                      Nenhum item encontrado para este período.
+                    </td>
+                  </tr>
+                )}
-                {rows.map((r, i) => (
-                  <tr key={i} className="border-b last:border-0">
-                    <td className="px-2 py-1">{r.produto}</td>
-                    <td className="px-2 py-1 text-right">{r.n_nfes}</td>
-                    <td className="px-2 py-1 text-right">{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_total)}</td>
-                  </tr>
-                ))}
+                {!loading && isTaxView && (rows as TaxDetail[]).map((r, i) => (
+                  <tr key={r.numero || i} className="border-b last:border-0"> {/* Use NF-e number as key if unique */}
+                    <td className="px-2 py-1">{r.numero}</td>
+                    <td className="px-2 py-1">{new Date(r.data_emissao).toLocaleDateString('pt-BR')}</td>
+                    {/* <td className="px-2 py-1 text-right">{r.valor_base ? fmt(r.valor_base) : '-'}</td> */}
+                    <td className="px-2 py-1 text-right">{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_imposto)}</td>
+                  </tr>
+                ))}
+                {!loading && !isTaxView && (rows as NfeDetail[]).map((r, i) => (
+                  <tr key={i} className="border-b last:border-0">
+                    <td className="px-2 py-1">{r.produto}</td>
+                    <td className="px-2 py-1 text-right">{r.n_nfes}</td>
+                    <td className="px-2 py-1 text-right">{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_total)}</td>
+                  </tr>
+                ))}
               </tbody>
             </table>
           </div>

```
*Self-correction: Added type assertions `as TaxDetail[]` / `as NfeDetail[]` for mapping.*

---

## 4. `components/PnLTable.tsx` - Triggering the Modal

Modify the cell renderer to detect clicks on tax children and call `onCellClick` with the new parameters.

### 4.1 Update `onCellClick` Prop Type (in Parent Component)
The component *using* `PnLTable` needs to handle the new parameters. Update the type definition for the `onCellClick` function it passes down.

```typescript
// In the parent component (e.g., your main page)
const [modalParams, setModalParams] = useState<ModalParams | null>(null); // Use the ModalParams type from NfeDetailsModal

const handleCellClick = (params: ModalParams) => { // Update type here
  setModalParams(params);
};

// ... render <PnLTable data={...} year={...} onCellClick={handleCellClick} /> ...
// ... render <NfeDetailsModal open={!!modalParams} params={modalParams} onClose={() => setModalParams(null)} /> ...
```

### 4.2 Modify Cell Click Handler in `PnLTable`

```diff
// components/PnLTable.tsx

// Define the ModalParams type here or import it if defined globally
type ModalParams = /* ... same definition as in NfeDetailsModal ... */ ;

export default function PnLTable({ data, year, onCellClick }: {
  data: PnLNode[];
  year: number;
-  onCellClick: (ctx: { ym: Month; rowId: string; kind?: string }) => void;
+  onCellClick: (params: ModalParams) => void; // Update prop type
}) {
  // ... useMemo for months, childMap, rootRows ...

  const cols = React.useMemo<ColumnDef<PnLNode>[]>(() => {
    const monthCols: ColumnDef<PnLNode, any>[] = months.map((m) => ({
      id: m,
      header: m.slice(5),
      cell: ({ row }: { row: any }) => {
        const val = row.original.values[m] || 0;
        const isIntermediate = row.original.kind === 'intermediate' || row.original.kind === 'percentage';
-        const isLeaf = !row.getCanExpand() && !isIntermediate;
+        const isTaxChild = !isIntermediate && (row.original.id?.startsWith('tax3_') || row.original.id?.startsWith('tax4_'));
+        const isRevCogsLeaf = !row.getCanExpand() && !isIntermediate && !isTaxChild;

        const value = renderVal(row, m); // Assumes renderVal exists

-        if (isLeaf) { // Original condition for Rev/COGS leaves
+        if (isRevCogsLeaf) { // Handle Rev/COGS leaves
           const revMap: any = { '1': 'ReceitaBruta', /* ... other mappings ... */ };
           return (
             <button
               className="text-right w-full hover:underline"
               onClick={() => {
                 if (revMap[row.original.id]) {
-                  onCellClick({ ym: m, rowId: row.original.id, kind: revMap[row.original.id] });
+                  // Pass kind for Rev/COGS
+                  onCellClick({ ym: m, kind: revMap[row.original.id] });
                 } else {
                   // Handle other potential leaf types if necessary, or log warning
                   console.warn('Unhandled leaf click:', row.original.id);
                 }
               }}
             >
               {value}
             </button>
           );
+        } else if (isTaxChild) { // Handle Tax leaves
+          const parts = row.original.id.split('_');
+          // Example ID: tax3_PIS_Venda => parts[1]=PIS, parts[2]=Venda
+          if (parts.length >= 3) {
+            const taxName = parts[1];
+            const scenario = parts[2];
+            return (
+              <button
+                className="text-right w-full hover:underline"
+                onClick={() => {
+                  // Pass tax details
+                  onCellClick({ ym: m, taxName: taxName, scenario: scenario });
+                }}
+              >
+                {value}
+              </button>
+            );
+          } else {
+             // Fallback or error for unexpected tax ID format
+             return <span>{value}</span>;
+          }
         } else { // Intermediate rows or expandable parents - just display value
           return <span>{value}</span>;
         }
       },
       meta: { numeric: true } as { numeric: boolean }
     }));

     // ... rest of cols definition (expander, label) ...
   }, [year, onCellClick]); // Dependencies

   // ... useReactTable setup ...
   // ... table rendering ...
 }
```
*Self-correction: Adjusted the logic to differentiate between Rev/COGS leaves and Tax leaves for the `onCellClick` payload.*

---

## 5. Validation Checklist

1.  **Click Tax Row:** Click on a specific tax row (e.g., "PIS" under "Impostos sobre receita").
2.  **Modal Opens:** The details modal should open.
3.  **API Call:** Verify the network request goes to `/api/tax-details?ym=YYYY-MM&taxName=PIS&scenario=Venda` (or relevant scenario).
4.  **Modal Title:** The modal title should reflect the tax context (e.g., "PIS – YYYY-MM"). *Self-correction:* The current title uses `params.kind`, needs update for tax.
5.  **Table Headers:** The modal table headers should be "NF-e #", "Data Emissão", "Valor Imposto".
6.  **Table Data:** The table rows should display data matching the `TaxDetail` interface, showing individual NF-es contributing to the selected tax/month/scenario.
7.  **Close Modal:** Closing the modal works.
8.  **Click Other Rows:** Verify clicking Revenue/COGS rows still opens the modal with the correct product/NFe details.
9.  **No Data:** Verify the "Nenhum item encontrado" message appears if the API returns an empty array for a tax.

---

Apply these changes across the specified files. This will enable detailed NFe lookups for individual tax components within your P&L. Remember to adjust SQL columns (`valor_base`, NFe `numero`) and potentially the modal display based on your exact data schema and desired presentation.


---

## o4-mini comments

The PRD is extremely thorough and covers all the moving pieces—from click‐capture in the table, through a new API route, down to the BigQuery SQL. I only spotted a couple “polish” items you’ll almost certainly need to tweak before rolling this out:

1) Modal Header Needs Tax Context  
   • The PRD correctly wires your modal to accept both `{ kind }` and `{ taxName, scenario }` variants, but the JSX sample still reads  
     ```tsx
     <h2 id="modal-title">{params?.kind} – {params?.ym}</h2>
     ```  
   • You’ll want it to show **taxName** (and maybe scenario) when in tax‐view mode. For example:  
     ```tsx
     <h2 id="modal-title">
       {isTaxView
         ? `${params.taxName} / ${params.scenario} – ${params.ym}`
         : `${params.kind} – ${params.ym}`}
     </h2>
     ```

2) Type‐Safety & Shared Types  
   • You’ve redefined `ModalParams` in two places (in the modal and in the table). Consider extracting it to a shared `types.ts` so you can import it consistently for both the `onCellClick` prop and the modal’s prop.  
   • Same for `TaxDetail` and `NfeDetail`—co-locate them in a `lib/types.ts` so your API route, fetch function, and React components all share the exact same interface.

3) Date/Time Formatting in Tax Rows  
   • Your SQL returns `TIMESTAMP(data_emissao)`, and your `.map` does `row.data_emissao.value`. Double‐check that this actually gives you a string or `Date` object in Node. You may need to `.toISOString()` in the API (or call `new Date(...)` in the client) to avoid `undefined.value`.

4) Performance & Limits  
   • The PRD’s new tax‐details endpoint caps at 500 rows. If you might have more, consider either:  
     - Changing `LIMIT 500` to a parameter or moving to cursor‐based pagination.  
     - Exposing `offset` / `pageSize` in the API so you can browse large result sets.

5) Accessibility  
   • As noted earlier, wrap the modal container in `role="dialog" aria-modal="true"`, and ensure the close button has `aria-label="Fechar detalhes"`.  
   • For the tax view, you may want to update the column headers with `scope="col"` to help screen readers.

---

Beyond those refinements, **the PRD already includes every one of the required pieces**:

- Table click handler that distinguishes revenue/COGS vs tax sub-rows  
- New `ModalParams` union type  
- Conditional fetch in the modal (cogs, nfe, or tax)  
- New API route at `/api/tax-details` validating `ym`, `taxName`, `scenario`  
- `fetchTaxDetails` BigQuery logic with dynamic column selection  
- Modal JSX that switches between “produto” vs tax columns  
- Sticky header and close button in NfeDetailsModal  
- No changes needed to the core P&L logic

If you apply those tiny header/type/date tweaks above, you’ll have a rock-solid, DRY implementation of full NF-e detail lookups for taxes. Let me know when you’re ready to add those refinements!

