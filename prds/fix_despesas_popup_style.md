
PRD – Align `DespesaDetailsModal` Styling with Other Modals
────────────────────────────────────────────────────────

**Goal:** Update the `DespesaDetailsModal` component to match the visual appearance and behavior of `NfeDetailsModal` and `TaxDetailsModal`, specifically regarding dynamic width, close button placement, and sticky table header.

**Problem Description:**

1.  **Fixed Width:** `DespesaDetailsModal` currently uses a fixed width (`max-w-2xl`), which might not be optimal for its content. Other modals use `max-w-3xl` or rely more on intrinsic content width.
2.  **Close Button Position:** The "Fechar" button is rendered *outside* the main content `div`, appearing below the table instead of in the header section.
3.  **Non-Sticky Header:** The table header (`thead`) scrolls with the content instead of remaining fixed at the top of the scrollable area.

**Target Style (from `NfeDetailsModal`/`TaxDetailsModal`):**

*   Outer wrapper: `fixed inset-0 z-50 flex items-center justify-center bg-black/30`
*   Modal container: `bg-white rounded-lg shadow-xl w-auto max-w-3xl max-h-[80vh] flex flex-col`
*   Sticky Header Section: `sticky top-0 z-10 bg-white px-4 pt-4 pb-2 border-b flex justify-between items-center rounded-t-lg` (contains title and close button)
*   Scrollable Content Section: `overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300` (contains the table)
*   Table Header (`thead`): `bg-gray-100 sticky top-0 z-0` (sticks *within* the scrollable section)

**Solution:**

Refactor the JSX structure and Tailwind classes of `DespesaDetailsModal.tsx` to match the layout pattern established by the other modals.

**Code Changes:**

File: `pnl-matrix/components/DespesaDetailsModal.tsx`

```diff
 "use client";
 import { useEffect, useState } from 'react';

 export interface DespesaDetail {
-    // ... existing fields
+  fornecedor: string;
+  nome_portador: string;
+  numero_documento: string;
+  data_competencia: string;
+  valor_documento: number;
 }

 const fmt = (v: number) =>
   Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

 export default function DespesaDetailsModal({ open, params, onClose }: {
   open: boolean;
   params: { ym: string; code: string; cat: string } | null;
   onClose: () => void;
 }) {
   const [rows, setRows] = useState<DespesaDetail[]>([]);
   const [loading, setLoading] = useState(false);

   useEffect(() => {
     if (!open) {
       setRows([]);
       setLoading(false);
       return;
     }
     if (!params) {
       setRows([]);
       setLoading(false);
       return;
     }
     setRows([]); // Clear stale
     setLoading(true);
     fetch(`/api/despesa-details?ym=${params.ym}&code=${encodeURIComponent(params.code)}&cat=${encodeURIComponent(params.cat)}`)
       .then(async (res) => {
         const data = await res.json();
         if (!res.ok || !Array.isArray(data)) {
           console.error('Error from /api/despesa-details:', data);
           setLoading(false);
           return [];
         }
         setLoading(false);
         return data;
       })
       .then(setRows)
       .catch((err) => {
         console.error('Fetch error in DespesaDetailsModal:', err);
         setRows([]);
         setLoading(false);
       });
   }, [open, params]);

   if (!open) return null;

+  const handleClose = () => {
+    setRows([]);
+    setLoading(false);
+    onClose();
+  };

   return (
-    <dialog open={open} className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-40 z-50 flex items-center justify-center">
-      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4">
-        <h2 className="text-lg font-semibold mb-2">{params?.code} – {params?.cat} – {params?.ym}</h2>
+    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
+      <div className="bg-white rounded-lg shadow-xl w-auto max-w-3xl max-h-[80vh] flex flex-col">
+        {/* Sticky Header */}
+        <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2 border-b flex justify-between items-center rounded-t-lg">
+          <h2 id="modal-title" className="text-lg font-semibold">
+            {params?.code} – {params?.cat} – {params?.ym}
+          </h2>
+          <button
+            className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm"
+            aria-label="Fechar detalhes"
+            onClick={handleClose}
+          >
+            Fechar
+          </button>
+        </div>
+        {/* Scrollable Table Content */}
+        <div className="overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300">
         <table className="w-full text-sm">
-            <thead>
+            <thead className="bg-gray-100 sticky top-0 z-0"> {/* Sticky thead */}
             <tr>
                 <th className="text-left px-2 py-1">Fornecedor</th>
                 <th className="text-left px-2 py-1">Portador</th>
@@ -79,8 +107,8 @@
             <tbody>
               {loading && (
                 <tr>
-                  <td colSpan={5} className="text-center italic text-gray-500 py-4">Carregando...</td>
+                  <td colSpan={5} className="text-center italic text-gray-500 py-4">Carregando detalhes...</td>
                 </tr>
               )}
               {!loading && rows.length === 0 && (
                 <tr>
-                  <td colSpan={5} className="text-center italic text-gray-500 py-4">Nenhum item encontrado.</td>
+                  <td colSpan={5} className="text-center italic text-gray-500 py-4">Nenhum item encontrado para este período.</td>
                 </tr>
               )}
               {rows.map((r, i) => (
@@ -95,10 +123,8 @@
             </tbody>
         </table>
         </div>
-        <button onClick={onClose} className="mt-4 px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm self-start">
-          Fechar
-        </button>
       </div>
-    </dialog>
+    </div>
   );
 }

```

**Explanation of Changes:**

1.  **Outer Wrapper:** Replaced `<dialog>` with `<div role="dialog">` and applied the standard overlay/centering classes.
2.  **Modal Container:** Updated container classes for consistent padding, max-width (`max-w-3xl`), max-height, and flex layout (`flex flex-col`).
3.  **Sticky Header:** Created a new `div` for the header section, applying `sticky top-0 z-10` classes. Moved the `h2` title and the "Fechar" button inside this header. Added `rounded-t-lg` for aesthetics.
4.  **Scrollable Content:** Wrapped the `<table>` in a new `div` with `overflow-y-auto p-4 scrollbar-thin...` classes to enable scrolling independently of the header.
5.  **Sticky Table Header:** Added `sticky top-0 z-0` to the `<thead>` element itself, making it stick *within* the scrollable content area.
6.  **Close Handler:** Introduced `handleClose` to manage state clearing, similar to other modals.
7.  **Loading/Empty States:** Updated text for consistency.
8.  **Interface:** Added missing fields to `DespesaDetail` based on table usage.

**Implementation Steps:**

1.  Apply the diff to `pnl-matrix/components/DespesaDetailsModal.tsx`.
2.  Restart the dev server or allow hot-reloading.
3.  Click on an expense sub-row.
4.  **Validate:**
    *   Modal appearance matches `NfeDetailsModal`/`TaxDetailsModal`.
    *   "Fechar" button is in the header.
    *   Table header sticks when scrolling long lists of expenses.
    *   Modal width feels appropriate (adjust `max-w-3xl` if needed).
