
Okay, here's the PRD detailing the necessary changes to improve the `NfeDetailsModal`.

---

# PRD ▸ Improve NFe Details Modal UX

**Goal:** Enhance the NFe details modal by:
1.  Making its width adjust to fit the content table without horizontal scrolling (up to a reasonable maximum).
2.  Moving the "Fechar" button to the header and making the header sticky during vertical scrolling.
3.  Clearing previous data immediately upon closing or reopening with new parameters to prevent flashing stale content.

**Solution:** Modify `NfeDetailsModal.tsx` to:
1.  Reset the `rows` state when `params` change or the modal is closed.
2.  Restructure the modal's internal layout to create a sticky header containing the title and the close button.
3.  Adjust Tailwind width classes to allow content-based sizing with a maximum width.

---

## 1. `components/NfeDetailsModal.tsx` - Code Changes

### 1.1 Data Reset Logic

Modify the `useEffect` hook to clear the `rows` state *before* initiating the fetch when `params` change. Also, modify the `onClose` prop handling to clear `rows` when the modal is explicitly closed.

```diff
 // components/NfeDetailsModal.tsx

 export default function NfeDetailsModal({ open, params, onClose }: { /* ...props */ }) {
   const [rows, setRows] = useState<NfeDetail[]>([]);

   useEffect(() => {
     if (!open || !params) {
+      // Clear rows if modal is closed or params are null initially
+      if (rows.length > 0) setRows([]);
       return;
     }

+    // Reset rows immediately when params change before fetching new data
+    setRows([]);

     const cogsKinds = ['CPV','CPV_Boni','Perdas','CPV_Devol'];
     const api = cogsKinds.includes(params.kind)
       ? '/api/cogs-details'
       : '/api/nfe-details';

     fetch(`${api}?ym=${params.ym}&kind=${params.kind}`)
       .then(async (res) => {
         const data = await res.json();
         if (!res.ok || !Array.isArray(data)) {
           console.error(`Error from ${api}:`, data);
           return [];
         }
         return data;
       })
       .then(setRows)
       .catch((err) => {
         console.error('Fetch error in NfeDetailsModal:', err);
         setRows([]);
       });
-  }, [open, params]); // Keep dependencies
+  }, [open, params, rows.length]); // Add rows.length to dependency array only for the initial clear check if needed, otherwise just [open, params]

   if (!open) return null;

+  const handleClose = () => {
+    // Ensure rows are cleared when the modal is explicitly closed via the button
+    setRows([]);
+    onClose();
+  };

   return (
     // ... outer div ...
       // ... modal container div (adjust width here, see 1.3) ...
-        <h2 className="text-lg font-semibold mb-3">{params?.kind} – {params?.ym}</h2>
-        <table className="w-full text-sm">...</table>
-        <button className="mt-4 px-3 py-1 rounded bg-slate-200" onClick={onClose}>Fechar</button>
+        {/* Header Section (Sticky) - See 1.2 */}
+        {/* Table Section (Scrollable) - See 1.2 */}
       </div>
     // ...
   );
 }
```
*Self-correction: Simply clearing rows in `useEffect` when params change is sufficient. Clearing on explicit close via `handleClose` is also good.*

### 1.2 Header Structure (Sticky) & Close Button Relocation

Restructure the inner `div` to separate the header and the scrollable table content. Apply sticky positioning to the header.

```diff
 // components/NfeDetailsModal.tsx

   // ... useEffect, handleClose ...

   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
-      <div className="bg-white rounded-lg shadow-xl w-[34rem] max-h-[80vh] overflow-y-auto p-4">
+      {/* Apply max-width and height here, remove overflow-y-auto and p-4 */}
+      <div className="bg-white rounded-lg shadow-xl w-auto max-w-4xl max-h-[80vh] flex flex-col">
+        {/* Sticky Header */}
+        <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2 border-b flex justify-between items-center rounded-t-lg">
+          <h2 className="text-lg font-semibold">{params?.kind} – {params?.ym}</h2>
+          <button
+            className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm"
+            onClick={handleClose} // Use the new handler
+          >
+            Fechar
+          </button>
+        </div>
+
+        {/* Scrollable Table Content */}
+        <div className="overflow-y-auto p-4"> {/* Add padding back here */}
           <table className="w-full text-sm">
             <thead className="bg-gray-100 sticky top-0 z-0"> {/* Ensure thead is less sticky than header */}
               <tr>
                 <th className="text-left px-2 py-1">Produto</th>
                 <th className="text-right px-2 py-1">NF-es</th>
                 <th className="text-right px-2 py-1">Valor</th>
               </tr>
             </thead>
             <tbody>
               {rows.map((r, i) => (
                 <tr key={i} className="border-b last:border-0">
                   <td className="px-2 py-1">{r.produto}</td>
                   <td className="px-2 py-1 text-right">{r.n_nfes}</td>
                   <td className="px-2 py-1 text-right">{Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_total)}</td>
                 </tr>
               ))}
               {/* Add handling for empty rows maybe? */}
               {rows.length === 0 && (
                 <tr>
                   <td colSpan={3} className="text-center italic text-gray-500 py-4">
                     Carregando detalhes... ou nenhum dado encontrado.
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
-          {/* Button moved to header */}
-          {/* <button className="mt-4 px-3 py-1 rounded bg-slate-200" onClick={onClose}>Fechar</button> */}
         </div>
       </div>
     </div>
   );
 }

```

**Explanation:**
*   The main modal `div` now uses `flex flex-col`.
*   A new `div` wraps the `h2` title and the relocated `button`. This header `div` gets `sticky top-0 z-10 bg-white px-4 pt-4 pb-2 border-b` for styling and stickiness.
*   A second `div` wraps only the `table`. This `div` gets `overflow-y-auto p-4` to enable scrolling for the table content only and re-applies padding.
*   The `thead` inside the table also has `sticky top-0` but with `z-0` so it sticks *below* the main header.
*   A simple message is added when `rows` is empty.

### 1.3 Width Styling Adjustment

Modify the main modal container's width classes to allow it to grow based on content, up to a maximum.

```diff
 // components/NfeDetailsModal.tsx

   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
-      <div className="bg-white rounded-lg shadow-xl w-[34rem] max-h-[80vh] overflow-y-auto p-4">
+      {/* Change width: remove fixed width, use w-auto, add max-width */}
+      <div className="bg-white rounded-lg shadow-xl w-auto max-w-4xl max-h-[80vh] flex flex-col">
         {/* ... rest of the modal structure ... */}
       </div>
     </div>
   );
```

**Explanation:**
*   `w-[34rem]` is removed.
*   `w-auto` allows the width to be determined by the content.
*   `max-w-4xl` (or `max-w-3xl`, `max-w-5xl` - adjust as needed) prevents the modal from becoming excessively wide on large screens or with very wide table content. The table itself has `w-full` within its scrollable container, ensuring it tries to fill the available space.

---

## 2. Logic/Data Changes (`lib/*`)

✅ **None required.** All changes are within the presentation component.

---

## 3. Validation Checklist

1.  **Data Reset:** Open modal for "ReceitaBruta", close it, open modal for "Desconto". Verify you *don't* see the "ReceitaBruta" data flash before the "Desconto" data loads. The table should show the "Carregando..." message briefly.
2.  **Sticky Header:** Open a modal with enough rows to require scrolling. Scroll down. Verify the header (Title and "Fechar" button) stays fixed at the top.
3.  **Close Button:** Confirm the "Fechar" button is now in the top-right of the header and correctly closes the modal (and clears data).
4.  **Width:** Open modals for different kinds/months. Verify the modal width adjusts to accommodate the table content (product names especially). Check that it doesn't exceed the `max-w-` limit you set. Ensure there's no *horizontal* scrollbar on the modal or the table container.
5.  **Table Header Stickiness:** While scrolling the table content, the `thead` (Produto, NF-es, Valor) should stick just below the main header.

---

Apply these changes to `NfeDetailsModal.tsx`. This addresses the data flashing, improves the layout with a sticky header, moves the close button, and makes the width more responsive to content. Remember to adjust `max-w-` if `4xl` isn't the right fit for your typical data.


---

## o4-mini comments

The PRD covers all the functional requirements—data reset, sticky header with relocated “Fechar” button, and dynamic width to avoid horizontal scrolling. Overall it’s solid. A few polish points and small corrections I’d suggest:

1. Simplify the `useEffect` dependencies  
   - You only need one effect keyed on `[open, params]`.  
   - Clearing `rows` when `open` goes false or `params` change can live in the same hook before you kick off the fetch.  
   - Avoid including `rows.length` in the deps array—it can trigger extra clears on every render.

   **Suggested change:**
   ```ts
   useEffect(() => {
     if (!open) {
       setRows([]);
       return;
     }
     if (!params) {
       setRows([]);
       return;
     }
     // Clear stale rows
     setRows([]);
     // ...fetch logic...
   }, [open, params]);
   ```

2. Extract the header into its own component (optional)  
   - Makes the JSX a bit cleaner and focuses the modal return on layout rather than logic.  
   - E.g. `<ModalHeader title={`${kind} – ${ym}`} onClose={handleClose}/>` with its own sticky styles.

3. Accessibility tweaks  
   - Wrap the modal in `<div role="dialog" aria-modal="true" aria-labelledby="modal-title">`.  
   - Give the `<h2>` an `id="modal-title"` and the close button `aria-label="Fechar detalhes"`.
   - This helps screen‐reader users know it’s a dialog.

4. Scrollbar styling (optional)  
   - You may want to add `scrollbar-thin scrollbar-thumb-slate-300` to the scrollable `<div>` to match your design system.

5. Empty‐state feedback  
   - You already show “Carregando…”. Consider a separate message if the fetch completes but returns `[]`, like “Nenhum item encontrado para …”.

6. Max‐width choice  
   - `max-w-4xl` (≈56rem) may be wider than your table needs.  
   - If your product names usually fit in ~40rem, test `max-w-3xl` or `max-w-2xl` to avoid overly wide dialogs on large screens.

With these small tweaks—streamlining the effect, adding a11y, and handling empty‐vs‐loading states—you’ll have a bullet-proof, polished detail modal. Everything you outlined will work as intended once you apply the one JSX refactor and hook cleanup.

