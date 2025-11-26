# 📜 Implementation Guide – Expense Cell Drill‑Down Popup **(MySQL version)**

> **Change**: Despesa data resides in **MySQL**. We’ll query it via the existing `mysql2` pool (`getMysqlPool`). All frontend pieces remain the same — only the data‑layer helper and API route import change. 

---

## 1 MySQL helper – `lib/despesaDetails.ts` *(new file / replaces previous BQ helper)*

```ts
import { getMysqlPool } from './db';

export interface DespesaDetail {
  data_entrada: string;          // YYYY-MM-DD
  fornecedor_fantasia: string;
  valor_documento: number;
}

export async function fetchDespesaDetails({
  ym,   // '2025-01'
  code, // '2.10 + Desconsiderados'
  cat,  // 'Contrato de câmbio'
}: { ym: string; code: string; cat: string }): Promise<DespesaDetail[]> {
  const pool = await getMysqlPool();

  const sql = `
    SELECT
      DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%d/%m/%Y'), '%Y-%m-%d') AS data_entrada,
      cl.nome_fantasia                                                   AS fornecedor_fantasia,
      cp.valor_documento                                                 AS valor_documento
    FROM omie_contas_pagar_api cp
    LEFT JOIN omie_clientes_api cl ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
    WHERE DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%d/%m/%Y'), '%Y-%m') = ?
      AND CONCAT(SUBSTRING_INDEX(cp.codigo_categoria,'.',2), ' + ', ?) = ?
      AND cp.categoria_descricao = ?
      AND cp.status_titulo != 'CANCELADO'
    ORDER BY cp.valor_documento DESC
    LIMIT 300`;

  const grpDesc = code.split(' + ')[1] ?? '';
  const [rows] = await pool.execute<DespesaDetail[]>(sql, [ym, grpDesc, code, cat]);
  return rows;
}
```

*Security*: uses positional params → SQL‑injection safe. *Performance*: limited rows.

---

## 2 API route – `app/api/despesa-details/route.ts` *(only import changed)*

```ts
import { NextResponse } from 'next/server';
import { fetchDespesaDetails } from '@/lib/despesaDetails';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ym   = searchParams.get('ym')   ?? '';
  const code = searchParams.get('code') ?? '';
  const cat  = searchParams.get('cat')  ?? '';

  if (!/^\d{4}-\d{2}$/.test(ym) || !code || !cat) {
    return NextResponse.json({ error: 'bad params' }, { status: 400 });
  }

  try {
    const rows = await fetchDespesaDetails({ ym, code, cat });
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'db failure' }, { status: 500 });
  }
}
```

---
## 3 PnLTable – Make leaf values clickable

In **`components/PnLTable.tsx`**, enhance the `monthCols` renderer so **only leaf rows** render a `<button>` that invokes `onCellClick` with `{ ym, rowId }`:

```diff
...monthCols.map((m) => ({
  id: m,
  header: m.slice(5),
- cell: ({ row }) => fmt(row.original.values[m] || 0),
+ cell: ({ row }) => {
+   const value = fmt(row.original.values[m] || 0);
+   const isLeaf = !row.getCanExpand();
+   return isLeaf ? (
+     <button
+       className="text-right w-full hover:underline"
+       onClick={() => onCellClick({ ym: m, rowId: row.id })}
+     >
+       {value}
+     </button>
+   ) : (
+     <span>{value}</span>
+   );
+ },
}))
```

> **Also** update the component signature to accept the handler:
> ```ts
> export default function PnLTable({ data, year, onCellClick }:
>   { data: PnLNode[]; year: number; onCellClick: (ctx: { ym: Month; rowId: string }) => void; }
> ) { /* ... */ }
> ```

---
## 4 PnL Page – Wire click → modal

In **`app/pnl/page.tsx`** (make this a Client component if not already):

1. **Import** at top:
   ```tsx
   'use client';
   import { useState } from 'react';
   import DespesaDetailsModal from '@/components/DespesaDetailsModal';
   import PnLTable from '@/components/PnLTable';
   ```

2. **Add state & handler** before return:
   ```tsx
   const [modalOpen, setModalOpen] = useState(false);
   const [modalParams, setModalParams] = useState<null | { ym: string; code: string; cat: string }>(null);

   const openDetailsModal = ({ ym, rowId }: { ym: string; rowId: string }) => {
     const node   = data.find((d) => d.id === rowId)!;
     const parent = data.find((d) => d.id === node.parentId)!;
     setModalParams({ ym, code: parent.label, cat: node.label });
     setModalOpen(true);
   };  
   ```

3. **Render** the table + modal:
   ```tsx
   <YearSelect />
   <PnLTable data={data} year={year} onCellClick={openDetailsModal} />
   <DespesaDetailsModal
     open={modalOpen}
     params={modalParams}
     onClose={() => setModalOpen(false)}
   />
   ```

---
## 5 Testing checklist Testing checklist

1. Click any leaf expense cell → network tab shows `GET /api/despesa-details?...`; server logs a MySQL `SELECT`.
2. Modal lists ≤ 300 rows; currency sum equals original cell (manual check).
3. Malformed URL → 400; DB outage → 500 handled.

**Only two files added/modified**, everything else from previous docs stays valid.

