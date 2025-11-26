# PRD: Add “Observação” and “Status” Columns to Despesa‐Details Table

## 🧐 Background & Goal

When you click on a despesa cell in the P&L, we open a modal (`DespesaDetailsModal`) that currently shows a 3-column table:

- **Data**  
- **Fornecedor**  
- **Valor**  

The API already returns two extra fields per row:

- `observacao`  
- `status_titulo`  

**Goal:** extend the table to **5 columns** in this order:
Data | Fornecedor | Observação | Status | Valor

---

## 🛠 Step-by-step Changes

### 1. Extend the front-end row-type

**File:** `pnl-matrix/components/DespesaDetailsModal.tsx`

- Locate the `export interface DespesaDetail { … }` at the top.
- Add `observacao: string;` and `status_titulo: string;` **before** `valor_documento`.

```diff
 export interface DespesaDetail {
   data_entrada: string;
   fornecedor_fantasia: string;
+  observacao:         string;
+  status_titulo:      string;
   valor_documento:    number;
 }
```

---

### 2. Update the table header to 5 columns

**File:** `pnl-matrix/components/DespesaDetailsModal.tsx`

- In the `<thead>` block, replace the 3 `<th>`s with 5:

```diff
 <thead className="bg-gray-100 sticky top-0 z-0">
   <tr>
-    <th className="text-left px-2 py-1">Data</th>
-    <th className="text-left px-2 py-1">Fornecedor</th>
-    <th className="text-right px-2 py-1">Valor</th>
+    <th className="text-left  px-2 py-1">Data</th>
+    <th className="text-left  px-2 py-1">Fornecedor</th>
+    <th className="text-left  px-2 py-1">Observação</th>
+    <th className="text-left  px-2 py-1">Status</th>
+    <th className="text-right px-2 py-1">Valor</th>
   </tr>
 </thead>
```

---

### 3. Increase `colSpan` from 3 → 5 in loading/empty rows

**File:** `pnl-matrix/components/DespesaDetailsModal.tsx`

- Two spots (the “Carregando…” and “Nenhum item…” rows) each use `colSpan={3}`. Change both to `colSpan={5}`:

```diff
 {loading && (
   <tr>
-    <td colSpan={3} className="text-center italic text-gray-500 py-4">
+    <td colSpan={5} className="text-center italic text-gray-500 py-4">
       Carregando detalhes...
     </td>
   </tr>
 )}
 
 {!loading && rows.length === 0 && (
   <tr>
-    <td colSpan={3} className="text-center italic text-gray-500 py-4">
+    <td colSpan={5} className="text-center italic text-gray-500 py-4">
       Nenhum item encontrado para este período.
     </td>
   </tr>
 )}
```

---

### 4. Render the new cells in each data row

**File:** `pnl-matrix/components/DespesaDetailsModal.tsx`

- Inside `{rows.map(...)}`, change the 3-cell `<tr>` to include Observação and Status **before** Valor:

```diff
 {rows.map((r, i) => (
   <tr key={i} className="border-b last:border-0">
-    <td className="px-2 py-1">{r.data_entrada}</td>
-    <td className="px-2 py-1">{r.fornecedor_fantasia}</td>
-    <td className="px-2 py-1 text-right">{fmt(r.valor_documento)}</td>
+    <td className="px-2 py-1">{r.data_entrada}</td>
+    <td className="px-2 py-1">{r.fornecedor_fantasia}</td>
+    <td className="px-2 py-1">{r.observacao}</td>
+    <td className="px-2 py-1">{r.status_titulo}</td>
+    <td className="px-2 py-1 text-right">{fmt(r.valor_documento)}</td>
   </tr>
 ))}
```

---

### 5. (Optional) Update back-end row-type for consistency

_To keep types in sync (not strictly needed at runtime, but recommended)_

**File:** `pnl-matrix/lib/despesaDetails.ts`

- Extend the `DespesaDetail` interface:

```diff
 export interface DespesaDetail {
   data_entrada:        string;
   fornecedor_fantasia: string;
+  observacao:          string;
+  status_titulo:       string;
   valor_documento:     number;
 }
```

---

## ✅ After Changes

1. **Re-start your dev server** (if you had to rebuild types).  
2. Open the P&L, click on any despesa cell → the modal shows:
