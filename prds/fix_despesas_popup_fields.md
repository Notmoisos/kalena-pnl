# PRD – Fix `DespesaDetailsModal` Fields to Match API

**Goal:** Ensure the expense details modal shows exactly the fields returned by `/api/despesa-details`, specifically:

- `data_entrada` as **Data**
- `fornecedor_fantasia` as **Fornecedor**
- `valor_documento` as **Valor**

Nothing else should appear.

---

## 1. Update Interface

File: `pnl-matrix/components/DespesaDetailsModal.tsx`

Replace current `DespesaDetail` interface (which has extra fields) with only:

```ts
export interface DespesaDetail {
  data_entrada: string;
  fornecedor_fantasia: string;
  valor_documento: number;
}
```

---

## 2. Adjust Table Header Columns

In the JSX return of `DespesaDetailsModal`, locate the `<thead>`:

```jsx
<thead className="bg-gray-100 sticky top-0 z-0">
  <tr>
    <th className="text-left px-2 py-1">Fornecedor</th>
    <th className="text-left px-2 py-1">Portador</th>
    <th className="text-left px-2 py-1">Documento</th>
    <th className="text-left px-2 py-1">Competência</th>
    <th className="text-right px-2 py-1">Valor</th>
  </tr>
</thead>
```

Replace it with exactly three columns:

```jsx
<thead className="bg-gray-100 sticky top-0 z-0">
  <tr>
    <th className="text-left px-2 py-1">Data</th>
    <th className="text-left px-2 py-1">Fornecedor</th>
    <th className="text-right px-2 py-1">Valor</th>
  </tr>
</thead>
```

---

## 3. Adjust Table Body Rows

Locate the `<tbody>` mapping:

```jsx
{rows.map((r, i) => (
  <tr key={i} className="border-b last:border-0">
    <td className="px-2 py-1">{r.fornecedor}</td>
    <td className="px-2 py-1">{r.nome_portador}</td>
    <td className="px-2 py-1">{r.numero_documento}</td>
    <td className="px-2 py-1">{r.data_competencia}</td>
    <td className="px-2 py-1 text-right">{fmt(r.valor_documento)}</td>
  </tr>
))}
```

Replace with:

```jsx
{rows.map((r, i) => (
  <tr key={i} className="border-b last:border-0">
    <td className="px-2 py-1">{r.data_entrada}</td>
    <td className="px-2 py-1">{r.fornecedor_fantasia}</td>
    <td className="px-2 py-1 text-right">{fmt(r.valor_documento)}</td>
  </tr>
))}
```

---

## 4. Remove Unused Imports/Variables

After updating the interface and body, you can remove:

- Any leftover references to `nome_portador`, `numero_documento`, `data_competencia`.
- Corresponding table header columns.

---

## 5. Validate

1. Restart or hot-reload.
2. Click an expense sub-row.
3. **Expected:** Modal shows a 3-column table:
   - **Data**: value from `data_entrada`
   - **Fornecedor**: value from `fornecedor_fantasia`
   - **Valor**: formatted `valor_documento`
4. No additional columns.
5. Header remains sticky; close button in header.
6. Loading and empty states unchanged.

Once validated, delete any unused variables related to the removed fields. 