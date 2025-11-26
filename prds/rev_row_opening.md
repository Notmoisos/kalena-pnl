## USER MESSAGE

this is a patch with changes that I made to implement the following features in my app:

add a chevron button in Receitas and in some other columns of our PnL table, when clicking it, we would call an API which would retrieve the, in this case, Receita Information, grouped by the field of descricao_familia, and display it as subrows, for all the months of the year in the PnL table

this worked but i am pretty sure there was unecessary changes to the code made to accomplish this, so i need you to do a deep investigation in our current codebase and in the patch file and see exactly what is the necessary changes that were done to accomplish this and create a new PRD document based on the current codebase in which you will write exactly change by change what should be done in the better manner to accomplish this feature

you will be able to see that this also works for some other rows, but right now, please just focus on making it work for the Receita Bruta / Gross Revenue row! just add the changes required for this working in this row!

also, keep in mind the changes broke the desired behaviour of when clicking into a value of a "despesa" section, we send a API request to get the detail of that value and display in a popup - this is already implemented in the current codebase and works just fine, but the changes in the patch file made those values unclickable

pls proceed with making me a new PRD file using markdown with the exact code changes step by step


## AI MESSAGE:

Okay, I've analyzed the patch and your requirements. The goal is to implement the family drill-down feature specifically for the "Receita Bruta" (Gross Revenue) row, ensuring that the existing functionality of clicking on "Despesa" (Expense) values to open a detail popup is not broken.

Here's a PRD (Product Requirements Document) detailing the necessary changes in a step-by-step manner. This focuses on the minimal changes for "Receita Bruta" and addresses the issues you mentioned.

## PRD: Receita Bruta Family Drilldown

**Objective:** Enable users to drill down into the "Receita Bruta" row in the P&L table to see a breakdown by "família de produto" for all months of the selected year. This should be achieved by clicking a chevron icon next to the "Receita Bruta" label. Clicking on cell values for "Despesas" to open detail popups must remain functional.

**Affected Files:**

1.  `pnl-matrix/lib/pnlLogic.ts` (Type definition update)
2.  `pnl-matrix/lib/nfeFamily.ts` (New file for fetching family-specific data)
3.  `pnl-matrix/app/api/nfe-details/route.ts` (API endpoint modification)
4.  `pnl-matrix/components/PnLTable.tsx` (Main UI and logic changes)

---

### Step 1: Update PnLNode Type

**File:** `pnl-matrix/lib/pnlLogic.ts`

**Change:** Add `'family'` and `'loading'` to the `kind` property in the `PnLNode` type to support styling for the new sub-row types.

```typescript:pnl-matrix/lib/pnlLogic.ts
// ... existing code ...
export type PnLNode = {
  id: string;
  parentId?: string;
  label: string;
  sign?: '+' | '-';
  values: { [k: string]: number }; // month → amount, allows Month or string keys
  // OPTIONAL extras for UI
  kind?: 'intermediate' | 'percentage' | 'family' | 'loading'; // MODIFIED: Added 'family' and 'loading'
  className?: string;                     // tailwind row‑level styling
};
// ... existing code ...
```

---

### Step 2: Add Library for Fetching Family-Grouped NFe Data

**File:** `pnl-matrix/lib/nfeFamily.ts` (Create this new file)

**Change:** Introduce a new function `fetchFamilyDetails` to retrieve NFe data aggregated by `descricao_familia` for a given year and kind (e.g., 'ReceitaBruta').

```typescript:pnl-matrix/lib/nfeFamily.ts
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.BQ_KEYFILE,
});

// Interface for the API response structure when fetching family details
export interface FamilyApiRow {
  familia: string;
  ym: string; // YYYY-MM
  valor: number;
}

export async function fetchFamilyDetails(
  year: string,
  kind: string,
  // taxName and scenario are not used for ReceitaBruta but kept for potential future use with this function
  taxName?: string, 
  scenario?: string 
): Promise<FamilyApiRow[]> {
  let filter = "1=0"; // Default to no results if kind is not recognized for family breakdown
  let metric = 'parsed_total_product_value'; // Default metric

  // For Receita Bruta
  if (kind === 'ReceitaBruta') {
    filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
    metric = 'parsed_total_product_value';
  }
  // Add other kind conditions here if this function is to be reused for other family breakdowns (e.g., CPV, Descontos)
  // Example for CPV (from patch, can be added if needed later):
  // else if (kind === 'CPV') {
  //   filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
  //   metric = 'parsed_unit_cost*parsed_quantity_units';
  // }

  const sql = `
    SELECT 
      descricao_familia AS familia, 
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym, 
      SAFE_CAST(SUM(${metric}) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE 
      ${filter} AND 
      FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym 
    ORDER BY ym, valor DESC 
    LIMIT 500`;

  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as FamilyApiRow[];
}
```

---

### Step 3: Modify API Endpoint for NFe Details

**File:** `pnl-matrix/app/api/nfe-details/route.ts`

**Change:** Update the `GET` handler to accept `year` and `breakdown` query parameters. If `breakdown` is `'family'`, call `fetchFamilyDetails`.

```typescript:pnl-matrix/app/api/nfe-details/route.ts
// ... existing code ...
import { NextResponse } from 'next/server';
import { fetchNfeDetails, RevKind } from '@/lib/nfeRevenue';
import { fetchFamilyDetails } from '@/lib/nfeFamily'; // ADDED import

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const year = p.get('year') ?? (ym ? ym.split('-')[0] : ''); // ADDED: derive year if not present
  const kind = p.get('kind') ?? '';
  const breakdown = p.get('breakdown'); // ADDED: get breakdown param

  // ADDED: Handle family breakdown
  if (breakdown === 'family') {
    if (!year || !kind) { // Kind is needed to determine what to fetch
      return NextResponse.json({ error: 'bad params for family breakdown' }, { status: 400 });
    }
    // For now, we are primarily interested in ReceitaBruta for family breakdown
    // This can be expanded later if other kinds support family breakdown via this endpoint
    if (kind === 'ReceitaBruta') {
      const rows = await fetchFamilyDetails(year, kind);
      return NextResponse.json(rows);
    } else {
      // If other kinds are requested with breakdown=family but not supported here
      return NextResponse.json({ error: `Family breakdown not supported for kind: ${kind}` }, { status: 400 });
    }
  }

  // Existing logic for single month details
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !['ReceitaBruta', 'Devolucao', 'Desconto'].includes(kind))
    return NextResponse.json({ error: 'bad params for single month details' }, { status: 400 });
  
  return NextResponse.json(await fetchNfeDetails(ym, kind as RevKind));
}
```

---

### Step 4: Update `PnLTable` Component

**File:** `pnl-matrix/components/PnLTable.tsx`

**Changes:**

1.  Import necessary types and functions.
2.  Add state for `familyData` and `loadingFamily`.
3.  Add `transformApiRows` helper function.
4.  Modify `cols` definition:
    *   **Month Cells**: Ensure click handlers correctly call `onCellClick` for modals (Despesas, etc.) and are *not* used for family expansion. "Receita Bruta" cells themselves should not be clickable buttons for this purpose.
    *   **Expander Cell**: Implement logic to fetch and display family data for "Receita Bruta" (ID '1') when its chevron is clicked.
5.  Update `useReactTable` options:
    *   `getRowCanExpand`: Allow "Receita Bruta" (ID '1') and rows with existing children to expand.
    *   `getSubRows`: Provide family data or loading indicators for "Receita Bruta", and standard children for other rows.
6.  Adjust styling for new row kinds.

```tsx:pnl-matrix/components/PnLTable.tsx
// ... existing code ...
import { PnLNode as BasePnLNode, Month } from '@/lib/pnlLogic'; // BasePnLNode might be PnLNode already
import { FamilyApiRow } from '@/lib/nfeFamily'; // ADDED: Import FamilyApiRow

// ... existing code ...

// MODIFIED: Ensure PnLNode includes new kinds
type PnLNode = BasePnLNode & { kind?: 'intermediate' | 'percentage' | 'family' | 'loading' };


// ADDED: Helper to pivot API rows into PnLNode[]
function transformApiRows(
  apiRows: FamilyApiRow[],
  parentId: string,
  months: string[]
): PnLNode[] {
  const map = new Map<string, PnLNode>();
  apiRows.forEach((r) => {
    const nodeId = `${parentId}_family_${r.familia.replace(/\s+/g, '_').replace(/[^\w-]/g, '')}`;
    const node = map.get(r.familia) ?? {
      id: nodeId,
      parentId,
      label: r.familia,
      kind: 'family',
      values: {},
    };
    node.values[r.ym] = r.valor;
    map.set(r.familia, node);
  });
  // Fill missing months with zero
  for (const node of map.values()) {
    months.forEach((m) => {
      if (!(m in node.values)) node.values[m] = 0;
    });
  }
  return Array.from(map.values());
}

export default function PnLTable({ data, year, onCellClick }: {
  data: PnLNode[];
  year: number;
  // Ensure onCellClick prop types are correctly defined for Nfe, Tax, Despesa details
  onCellClick: (params: { ym: string; rowId: string; kind?: string; taxName?: string; scenario?: string }) => void;
}) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, '0')}`), [year]);
  
  const childMap = useMemo(() => {
    const map: Record<string, PnLNode[]> = {};
    data.forEach(n => {
      if (n.parentId) {
        map[n.parentId] = map[n.parentId] || [];
        map[n.parentId].push(n);
      }
    });
    return map;
  }, [data]);

  const rootRows = useMemo(() => data.filter((n) => !n.parentId), [data]);

  // ADDED: State for family data and loading states
  const [familyData, setFamilyData] = React.useState<Record<string, PnLNode[]>>({});
  const [loadingFamily, setLoadingFamily] = React.useState<Record<string, boolean>>({});

  const cols = React.useMemo<ColumnDef<PnLNode>[]>(() => {
    const monthCols: ColumnDef<PnLNode, any>[] = months.map((m) => ({
      id: m,
      header: m.slice(5), // Display MM
      meta: { numeric: true },
      cell: ({ row }: { row: Row<PnLNode> }) => { // Use Row<PnLNode> for correct typing
        const value = renderVal(row.original, m); // Use row.original for PnLNode properties
        
        // Determine if this cell should be a button for modal popups (NFe, Tax, Despesas)
        // It should NOT be a button for 'Receita Bruta' (id: '1') cells, as its interaction is the chevron.
        // It should also not be a button for intermediate/percentage rows or already expanded parent rows.
        const isIntermediateOrPercentage = row.original.kind === 'intermediate' || row.original.kind === 'percentage';
        const isReceitaBrutaRow = row.original.id === '1';

        // Original logic for identifying rows that trigger modals via onCellClick
        const revMap: Record<string, string> = {
          // '1': 'ReceitaBruta', // Exclude '1' as its cells are not buttons for modals
          '2': 'Devolucao',
          '5': 'Desconto',
          // ... other revenue/COGS mappings that open NFeDetailsModal ...
        };
        const cogsMap: Record<string, string> = {
          '7': 'CPV', 
          '8': 'CPV_Boni', 
          '9': 'Perdas', 
          '10': 'CPV_Devol',
        };
        const isTaxChild = /^tax(3|4)_/.test(row.original.id) || row.original.id === 'taxIPI';
        
        // A cell is clickable for a modal if it's a leaf node (for despesas) or a specific kind (NFe, Tax)
        // AND it's not an intermediate/percentage row, AND not the "Receita Bruta" row itself.
        // Despesa rows are typically leaves and don't have a 'kind' in revMap/cogsMap or aren't tax children.
        // Their IDs (e.g., '15', '16') are used directly in onCellClick.
        let isModalClickable = !isIntermediateOrPercentage && !isReceitaBrutaRow && !row.getCanExpand(); // Base for despesas
        if (revMap[row.original.id] || cogsMap[row.original.id] || isTaxChild) {
           isModalClickable = !isIntermediateOrPercentage && !isReceitaBrutaRow; // NFe/Tax/COGS rows can be parents but cells still trigger specific modals
        }


        if (isModalClickable) {
          return (
            <button
              className="text-right w-full hover:underline"
              onClick={() => {
                let kindParam = revMap[row.original.id] || cogsMap[row.original.id];
                if (kindParam) {
                  onCellClick({ ym: m, rowId: row.original.id, kind: kindParam });
                } else if (isTaxChild) {
                  let taxName: string | undefined;
                  let scenarioKey: 'Venda' | 'Bonificacao' | 'Devolucao' | undefined;
                  if (row.original.id === 'taxIPI') {
                    taxName = 'IPI';
                    scenarioKey = 'Venda';
                  } else {
                    const match = row.original.id.match(/^tax[34]_(.+)_(Venda|Bonificacao|Devolucao)$/);
                    if (match) {
                      taxName = match[1];
                      scenarioKey = match[2] as 'Venda' | 'Bonificacao' | 'Devolucao';
                    }
                  }
                  if (taxName && scenarioKey) {
                    onCellClick({ ym: m, rowId: row.original.id, kind: 'tax', taxName, scenario: scenarioKey });
                  }
                } else {
                  // Default for other clickable leaves, like Despesas (e.g. ID '15', '16', '17')
                  onCellClick({ ym: m, rowId: row.original.id });
                }
              }}
            >
              {value}
            </button>
          );
        }
        return <span>{value}</span>; // Non-clickable cell
      },
    }));

    return [
      {
        id: 'expander',
        header: '',
        cell: ({ row }: { row: Row<PnLNode> }) => { // Use Row<PnLNode>
          if (!row.getCanExpand()) return null;

          const isReceitaBrutaRow = row.original.id === '1';
          const familyDataKey = `${row.original.id}_${year}`;

          return (
            <button
              onClick={async () => {
                row.toggleExpanded(); // Always toggle expand state
                if (isReceitaBrutaRow && !familyData[familyDataKey] && !loadingFamily[familyDataKey]) {
                  setLoadingFamily(p => ({ ...p, [familyDataKey]: true }));
                  try {
                    const url = `/api/nfe-details?year=${year}&kind=ReceitaBruta&breakdown=family`;
                    const apiResp = await fetch(url);
                    if (!apiResp.ok) throw new Error(`API Error: ${apiResp.status}`);
                    const apiRows: FamilyApiRow[] = await apiResp.json();
                    const formattedList = transformApiRows(apiRows, row.original.id, months);
                    setFamilyData(p => ({ ...p, [familyDataKey]: formattedList }));
                  } catch (error) {
                    console.error('Error fetching family details for Receita Bruta:', error);
                    // Optionally set error state or a special error node in familyData
                    setFamilyData(p => ({ ...p, [familyDataKey]: [{ id: `error_${familyDataKey}`, parentId: row.original.id, label: 'Erro ao carregar famílias.', values: {}, kind: 'family' }] }));
                  }
                  setLoadingFamily(p => ({ ...p, [familyDataKey]: false }));
                }
              }}
              className="mr-1"
              aria-label={row.getIsExpanded() ? 'Recolher' : 'Expandir'}
              aria-expanded={row.getIsExpanded()}
            >
              {row.getIsExpanded() ? '▼' : '▶'}
            </button>
          );
        }
      },
      {
        accessorKey: 'label',
        header: 'Conta',
        cell: ({ row, getValue }: { row: Row<PnLNode>, getValue: () => any }) => ( // Use Row<PnLNode>
          <span style={{ paddingLeft: `${row.depth * 1.5}rem` }}>
            {getValue()}
          </span>
        ),
      },
      ...monthCols
    ];
  }, [year, months, onCellClick, familyData, loadingFamily]); // Added familyData and loadingFamily as deps

  const [expanded, setExpanded] = React.useState<ExpandedState>({
    tax3: false,
    tax4: false,
    despesas: true, // Keep existing desired default states
  });

  const getSubRowsCallback = React.useCallback((row: PnLNode) => {
    const familyDataKey = `${row.id}_${year}`;
    if (row.id === '1') { // Receita Bruta
      if (loadingFamily[familyDataKey]) {
        return [{ id: `loading_${familyDataKey}`, parentId: row.id, label: 'Carregando famílias…', values: {}, kind: 'loading' } as PnLNode];
      }
      if (familyData[familyDataKey]) {
        return familyData[familyDataKey];
      }
    }
    return childMap[row.id] ?? undefined; // Use undefined if no children for TanStack Table v8
  }, [year, loadingFamily, familyData, childMap]);


  const table = useReactTable({
    data: rootRows,
    columns: cols,
    state: { expanded },
    onExpandedChange: setExpanded,
    // MODIFIED: getRowCanExpand to allow Receita Bruta (id: '1') to expand
    getRowCanExpand: (row: Row<PnLNode>) => { // Use Row<PnLNode>
      const isReceitaBrutaRow = row.original.id === '1';
      const hasPredefinedChildren = !!childMap[row.original.id]?.length;
      return isReceitaBrutaRow || hasPredefinedChildren;
    },
    getSubRows: getSubRowsCallback, // MODIFIED to use callback
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  return (
    <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
      {/* ... existing table head ... */}
      <thead className="bg-gray-50">
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id} scope="col" className={clsx("px-2 py-2 text-left text-sm font-semibold text-gray-900", (header.column.columnDef.meta && (header.column.columnDef.meta as any).numeric) ? 'text-right' : undefined)}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {table.getRowModel().rows.map(row => (
          <tr 
            key={row.id}
            className={clsx(
              'border-b last:border-0',
              // ADDED/MODIFIED: Styling for family and loading rows
              row.original.kind === 'family' ? 'bg-emerald-50' : undefined, // Light green for family
              row.original.kind === 'loading' ? 'bg-gray-100 text-gray-500' : undefined, // Light gray for loading
              row.original.kind && row.original.kind !== 'family' && row.original.kind !== 'loading' && row.original.kind !== 'percentage' && row.original.kind !== 'intermediate' ? 'bg-blue-900 text-white' : undefined, // existing intermediate/percentage, ensure not overridden by family/loading if they also have a kind
              row.original.kind === 'intermediate' || row.original.kind === 'percentage' ? 'bg-blue-900 text-white' : undefined,
              !row.original.kind && row.depth > 0 && 'bg-[#e3e6f1]' // existing child row styling
            )}
          >
            {/* MODIFIED: Handle loading row colspan */}
            {row.original.kind === 'loading' ? (
              <td colSpan={cols.length} className="px-2 py-1 text-center" style={{ paddingLeft: `${row.depth * 1.5 + 1.5}rem` }}>
                {row.original.label}
              </td>
            ) : (
              row.getVisibleCells().map(cell => (
                <td key={cell.id} className={clsx('px-2 py-1 whitespace-nowrap text-sm', (cell.column.columnDef.meta && (cell.column.columnDef.meta as any).numeric) ? 'text-right' : 'text-gray-700')}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

This set of changes should implement the family drilldown for "Receita Bruta" (ID '1') by clicking its chevron, fetch data from the API, display it as sub-rows with loading states, and critically, it should preserve the original `onCellClick` behavior for "Despesas" and other modal-triggering cells by ensuring the family expansion logic is separate and handled by the expander button. The styling for the new `family` and `loading` rows is also suggested. Remember to test thoroughly, especially the "Despesa" click functionality.


## user comments

setDataVersion(v => v + 1);

was a very important addition to make the table refresh with the new data

see if you should include that as well


## AI answer


You're absolutely right! Forcing a re-evaluation of the table's root data can be crucial for ensuring that changes in asynchronously loaded sub-row data are reliably reflected, especially with memoization involved. The `setDataVersion` approach is a common and effective pattern for this.

I will update the `PnLTable.tsx` changes in Step 4 to include the `dataVersion` state and its usage.

Here's the revised part of **Step 4 (`PnLTable.tsx`)** incorporating this:

---

### Step 4: Update `PnLTable` Component (Revised with `dataVersion`)

**File:** `pnl-matrix/components/PnLTable.tsx`

**Changes (highlights for `dataVersion` integration):**

1.  Add `dataVersion` state.
2.  Make `rootRows` memoization dependent on `dataVersion`.
3.  Increment `dataVersion` after `familyData` is successfully updated.

```tsx:pnl-matrix/components/PnLTable.tsx
// ... existing code ...
import { PnLNode as BasePnLNode, Month } from '@/lib/pnlLogic';
import { FamilyApiRow } from '@/lib/nfeFamily'; // Ensure this import is present

// ... existing code ...

type PnLNode = BasePnLNode & { kind?: 'intermediate' | 'percentage' | 'family' | 'loading' };

// ... transformApiRows function as previously defined ...

export default function PnLTable({ data, year, onCellClick }: {
  data: PnLNode[];
  year: number;
  onCellClick: (params: { ym: string; rowId: string; kind?: string; taxName?: string; scenario?: string }) => void;
}) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, '0')}`), [year]);
  
  const childMap = useMemo(() => {
    const map: Record<string, PnLNode[]> = {};
    data.forEach(n => {
      if (n.parentId) {
        map[n.parentId] = map[n.parentId] || [];
        map[n.parentId].push(n);
      }
    });
    return map;
  }, [data]);

  // ADDED: State for data versioning to help trigger table refresh
  const [dataVersion, setDataVersion] = React.useState(0);

  // MODIFIED: rootRows depends on data and dataVersion
  const rootRows = useMemo(() => {
    // console.log('Recalculating rootRows due to data or dataVersion change');
    return data.filter((n) => !n.parentId);
  }, [data, dataVersion]); 

  const [familyData, setFamilyData] = React.useState<Record<string, PnLNode[]>>({});
  const [loadingFamily, setLoadingFamily] = React.useState<Record<string, boolean>>({});

  const cols = React.useMemo<ColumnDef<PnLNode>[]>(() => {
    const monthCols: ColumnDef<PnLNode, any>[] = months.map((m) => ({
      // ... month cell definition as previously detailed, ensuring Despesa clicks work ...
      // (The month cell logic focusing on onCellClick for modals remains the same)
      id: m,
      header: m.slice(5), 
      meta: { numeric: true },
      cell: ({ row }: { row: Row<PnLNode> }) => { 
        const value = renderVal(row.original, m);
        const isIntermediateOrPercentage = row.original.kind === 'intermediate' || row.original.kind === 'percentage';
        const isReceitaBrutaRow = row.original.id === '1';

        const revMap: Record<string, string> = { '2': 'Devolucao', '5': 'Desconto', /* ... */ };
        const cogsMap: Record<string, string> = { '7': 'CPV', '8': 'CPV_Boni', '9': 'Perdas', '10': 'CPV_Devol', };
        const isTaxChild = /^tax(3|4)_/.test(row.original.id) || row.original.id === 'taxIPI';
        
        let isModalClickable = !isIntermediateOrPercentage && !isReceitaBrutaRow && !row.getCanExpand(); 
        if (revMap[row.original.id] || cogsMap[row.original.id] || isTaxChild) {
           isModalClickable = !isIntermediateOrPercentage && !isReceitaBrutaRow;
        }

        if (isModalClickable) {
          return (
            <button
              className="text-right w-full hover:underline"
              onClick={() => {
                let kindParam = revMap[row.original.id] || cogsMap[row.original.id];
                if (kindParam) {
                  onCellClick({ ym: m, rowId: row.original.id, kind: kindParam });
                } else if (isTaxChild) {
                  let taxName: string | undefined;
                  let scenarioKey: 'Venda' | 'Bonificacao' | 'Devolucao' | undefined;
                  if (row.original.id === 'taxIPI') {
                    taxName = 'IPI'; scenarioKey = 'Venda';
                  } else {
                    const match = row.original.id.match(/^tax[34]_(.+)_(Venda|Bonificacao|Devolucao)$/);
                    if (match) { taxName = match[1]; scenarioKey = match[2] as any; }
                  }
                  if (taxName && scenarioKey) {
                    onCellClick({ ym: m, rowId: row.original.id, kind: 'tax', taxName, scenario: scenarioKey });
                  }
                } else {
                  onCellClick({ ym: m, rowId: row.original.id });
                }
              }}
            >
              {value}
            </button>
          );
        }
        return <span>{value}</span>;
      },
    }));

    return [
      {
        id: 'expander',
        header: '',
        cell: ({ row }: { row: Row<PnLNode> }) => {
          if (!row.getCanExpand()) return null;
          const isReceitaBrutaRow = row.original.id === '1';
          const familyDataKey = `${row.original.id}_${year}`;

          return (
            <button
              onClick={async () => {
                row.toggleExpanded(); 
                if (isReceitaBrutaRow && !familyData[familyDataKey] && !loadingFamily[familyDataKey]) {
                  setLoadingFamily(p => ({ ...p, [familyDataKey]: true }));
                  try {
                    const url = `/api/nfe-details?year=${year}&kind=ReceitaBruta&breakdown=family`;
                    const apiResp = await fetch(url);
                    if (!apiResp.ok) throw new Error(`API Error: ${apiResp.status}`);
                    const apiRows: FamilyApiRow[] = await apiResp.json();
                    const formattedList = transformApiRows(apiRows, row.original.id, months);
                    
                    setFamilyData(p => ({ ...p, [familyDataKey]: formattedList }));
                    setDataVersion(v => v + 1); // INCREMENT dataVersion to force rootRows refresh
                                        
                  } catch (error) {
                    console.error('Error fetching family details for Receita Bruta:', error);
                    setFamilyData(p => ({ ...p, [familyDataKey]: [{ id: `error_${familyDataKey}`, parentId: row.original.id, label: 'Erro ao carregar famílias.', values: {}, kind: 'family' }] }));
                  } finally {
                    setLoadingFamily(p => ({ ...p, [familyDataKey]: false }));
                  }
                }
              }}
              className="mr-1"
              aria-label={row.getIsExpanded() ? 'Recolher' : 'Expandir'}
              aria-expanded={row.getIsExpanded()}
            >
              {row.getIsExpanded() ? '▼' : '▶'}
            </button>
          );
        }
      },
      {
        accessorKey: 'label',
        header: 'Conta',
        cell: ({ row, getValue }: { row: Row<PnLNode>, getValue: () => any }) => (
          <span style={{ paddingLeft: `${row.depth * 1.5}rem` }}>
            {getValue()}
          </span>
        ),
      },
      ...monthCols
    ];
  }, [year, months, onCellClick, familyData, loadingFamily, childMap]); // Removed dataVersion from here, rootRows handles it

  const [expanded, setExpanded] = React.useState<ExpandedState>({
    tax3: false, tax4: false, despesas: true,
  });

  const getSubRowsCallback = React.useCallback((row: PnLNode) => {
    const familyDataKey = `${row.id}_${year}`;
    if (row.id === '1') { 
      if (loadingFamily[familyDataKey]) {
        return [{ id: `loading_${familyDataKey}`, parentId: row.id, label: 'Carregando famílias…', values: {}, kind: 'loading' } as PnLNode];
      }
      if (familyData[familyDataKey]) {
        return familyData[familyDataKey];
      }
    }
    return childMap[row.id] ?? undefined; 
  }, [year, loadingFamily, familyData, childMap]);


  const table = useReactTable({
    data: rootRows, // rootRows will now have a new reference when dataVersion changes
    columns: cols,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowCanExpand: (row: Row<PnLNode>) => {
      const isReceitaBrutaRow = row.original.id === '1';
      const hasPredefinedChildren = !!childMap[row.original.id]?.length;
      return isReceitaBrutaRow || hasPredefinedChildren;
    },
    getSubRows: getSubRowsCallback,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  // ... rest of the component (table rendering) remains the same ...
  return (
    <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
      <thead className="bg-gray-50">
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <th key={header.id} scope="col" className={clsx("px-2 py-2 text-left text-sm font-semibold text-gray-900", (header.column.columnDef.meta && (header.column.columnDef.meta as any).numeric) ? 'text-right' : undefined)}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {table.getRowModel().rows.map(row => (
          <tr 
            key={row.id}
            className={clsx(
              'border-b last:border-0',
              row.original.kind === 'family' ? 'bg-emerald-50' : undefined, 
              row.original.kind === 'loading' ? 'bg-gray-100 text-gray-500' : undefined, 
              row.original.kind === 'intermediate' || row.original.kind === 'percentage' ? 'bg-blue-900 text-white' : undefined,
              !row.original.kind && row.depth > 0 && row.original.kind !== 'family' && row.original.kind !== 'loading' && 'bg-[#e3e6f1]'
            )}
          >
            {row.original.kind === 'loading' ? (
              <td colSpan={cols.length} className="px-2 py-1 text-center" style={{ paddingLeft: `${row.depth * 1.5 + 1.5}rem` }}>
                {row.original.label}
              </td>
            ) : (
              row.getVisibleCells().map(cell => (
                <td key={cell.id} className={clsx('px-2 py-1 whitespace-nowrap text-sm', (cell.column.columnDef.meta && (cell.column.columnDef.meta as any).numeric) ? 'text-right' : 'text-gray-700')}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Key changes related to `dataVersion`:
1.  `const [dataVersion, setDataVersion] = React.useState(0);` is added.
2.  `rootRows` is now `useMemo(() => data.filter((n) => !n.parentId), [data, dataVersion]);`.
3.  Inside the `expander` cell's `onClick` handler, after successfully fetching and setting family data:
    ```typescript
                    setFamilyData(p => ({ ...p, [familyDataKey]: formattedList }));
                    setDataVersion(v => v + 1); // Force rootRows to get a new reference
    ```
4.  The dependencies for the `cols` memoization do not need to include `dataVersion` directly, as `dataVersion` influences `rootRows`, which is a direct input to `useReactTable`. The `cols` themselves don't change based on `dataVersion`.

This ensures that when new family data is loaded, `rootRows` gets a new reference, signaling to `useReactTable` that its primary `data` prop has effectively changed, prompting a full re-evaluation and re-render that should correctly incorporate the new sub-row data provided by `getSubRowsCallback`.
I also moved `setLoadingFamily(p => ({ ...p, [familyDataKey]: false }));` into a `finally` block to ensure it's always reset. And adjusted the styling for `!row.original.kind && row.depth > 0` to avoid conflict with family/loading rows.
