# PRD ▸ Despesa Drill‑Down Modal (Front‑End Steps)

*Context:* Steps 1‑3 (MySQL helper, API route, clickable cells) are in place. This PRD covers **Step 4: the modal component and page wiring.**

---
## 1  Create `components/DespesaDetailsModal.tsx`
```tsx
'use client';
import { useEffect, useState } from 'react';

export interface DespesaDetail {
  data_entrada: string;
  fornecedor_fantasia: string;
  valor_documento: number;
}

export default function DespesaDetailsModal({
  open,
  params, // { ym, code, cat }
  onClose,
}: {
  open: boolean;
  params: { ym: string; code: string; cat: string } | null;
  onClose: () => void;
}) {
  const [rows, setRows]   = useState<DespesaDetail[]>([]);
  const [loading, setLoad] = useState(false);

  useEffect(() => {
    if (!open || !params) return;
    setLoad(true);
    fetch(`/api/despesa-details?ym=${params.ym}&code=${encodeURIComponent(params.code)}&cat=${encodeURIComponent(params.cat)}`)
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoad(false));
  }, [open, params]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-[34rem] max-h-[80vh] overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-3">
          {params?.cat} – {params?.ym}
        </h2>
        {loading ? (
          <p>Carregando…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1">Data</th>
                <th className="text-left px-2 py-1">Fornecedor</th>
                <th className="text-right px-2 py-1">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1 whitespace-nowrap">{r.data_entrada}</td>
                  <td className="px-2 py-1 truncate">{r.fornecedor_fantasia}</td>
                  <td className="px-2 py-1 text-right">
                    {Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_documento)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="mt-4 px-3 py-1 rounded bg-slate-200 hover:bg-slate-300" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
```

---
## 2  Convert `app/pnl/page.tsx` to a client component
1. Add `'use client';` as the first line.
2. Import React hooks and modal:
```tsx
import { useState } from 'react';
import DespesaDetailsModal from '@/components/DespesaDetailsModal';
```

### 2.1  State & handler
```tsx
const [modalOpen, setModalOpen] = useState(false);
const [modalParams, setModalParams] = useState<null | { ym: string; code: string; cat: string }>(null);

const openDetailsModal = ({ ym, rowId }: { ym: string; rowId: string }) => {
  const node   = data.find((d) => d.id === rowId)!;        // leaf row
  const parent = data.find((d) => d.id === node.parentId)!; // its group
  setModalParams({ ym, code: parent.label, cat: node.label });
  setModalOpen(true);
};
```

### 2.2  Render table + modal
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
## 3  Ensure `PnLTable` prop is connected
Already updated in earlier steps:
```tsx
<PnLTable … onCellClick={openDetailsModal} />
```

---
## 4  Test
1. Click a leaf‑level expense value ➜ modal opens with rows ordered by `valor_documento` (desc).  
2. Verify sum of `valor_documento` == table cell.  
3. ESC or **Fechar** button closes modal.

**Add these two files / edits and Step 4 is complete.**

