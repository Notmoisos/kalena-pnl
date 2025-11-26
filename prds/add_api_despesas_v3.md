# Change‑Set ▸ Hooking Up Drill‑Down Modal (only what’s left)

You already added the MySQL helper, API route, and made PnLTable cells clickable. The **remaining code you need** is just three inserts:

| File | What to add |
|------|-------------|
| **components/DespesaDetailsModal.tsx** *(new file)* | Paste the full modal component below. |
| **components/PnLTable.tsx** | Accept `onCellClick` prop and wrap leaf values in a `<button>` (snippet below). |
| **app/pnl/page.tsx** → become client wrapper | Add state + `openDetailsModal`, pass to table, render modal. |

---
## 1  `components/DespesaDetailsModal.tsx`
*(create this file)*
```tsx
'use client';
import { useEffect, useState } from 'react';
export interface DespesaDetail { data_entrada: string; fornecedor_fantasia: string; valor_documento: number; }
export default function DespesaDetailsModal({ open, params, onClose }: { open: boolean; params: { ym: string; code: string; cat: string } | null; onClose: () => void; }) {
  const [rows, setRows] = useState<DespesaDetail[]>([]);
  useEffect(() => {
    if (!open || !params) return;
    fetch(`/api/despesa-details?ym=${params.ym}&code=${encodeURIComponent(params.code)}&cat=${encodeURIComponent(params.cat)}`)
      .then(r => r.json())
      .then(setRows);
  }, [open, params]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-[34rem] max-h-[80vh] overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-3">{params?.cat} – {params?.ym}</h2>
        <table className="w-full text-sm"><thead className="bg-gray-100 sticky top-0"><tr><th className="text-left px-2 py-1">Data</th><th className="text-left px-2 py-1">Fornecedor</th><th className="text-right px-2 py-1">Valor</th></tr></thead><tbody>{rows.map((r,i)=>(<tr key={i} className="border-b last:border-0"><td className="px-2 py-1">{r.data_entrada}</td><td className="px-2 py-1">{r.fornecedor_fantasia}</td><td className="px-2 py-1 text-right">{Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(r.valor_documento)}</td></tr>))}</tbody></table>
        <button className="mt-4 px-3 py-1 rounded bg-slate-200" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
```

---
## 2  `components/PnLTable.tsx` snippet
Add prop + clickable leaf:
```diff
-export default function PnLTable({ data, year }:
-  { data: PnLNode[]; year: number; }) {
+export default function PnLTable({ data, year, onCellClick }:
+  { data: PnLNode[]; year: number; onCellClick: (c:{ym:Month;rowId:string})=>void; }) {
...
cell: ({ row }) => {
  const value = fmt(row.original.values[m] || 0);
  const isLeaf = !row.getCanExpand();
  return isLeaf ? (
    <button className="text-right w-full hover:underline" onClick={() => onCellClick({ ym: m, rowId: row.id })}>{value}</button>
  ) : <span>{value}</span>;
},
```

---
## 3  `app/pnl/page.tsx` client wrapper
```tsx
'use client';
import { useState } from 'react';
import DespesaDetailsModal from '@/components/DespesaDetailsModal';
...
const [modalOpen, setModalOpen] = useState(false);
const [modalParams, setModalParams] = useState<null | { ym: string; code: string; cat: string }>(null);
const openDetailsModal = ({ ym, rowId }: { ym: string; rowId: string }) => {
  const node   = data.find(d => d.id === rowId);
  if (!node) return;
  const parent = data.find(d => d.id === node.parentId);
  if (!parent) return;
  setModalParams({ ym, code: parent.label, cat: node.label });
  setModalOpen(true);
};
...
<PnLTable data={data} year={year} onCellClick={openDetailsModal} />
<DespesaDetailsModal open={modalOpen} params={modalParams} onClose={() => setModalOpen(false)} />
```

---
**Copy these three chunks and you’re done.** Modal now opens with voucher rows sorted by value, limited to 300.

