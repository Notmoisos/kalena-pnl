# PRD ▸ Show IPI line but exclude it from Net‑Revenue math

**Goal** Bring **IPI** back under *Impostos sobre receita* so users see the number, but ensure it is **not subtracted** when calculating *Receita Líquida / Net Revenue*.

Solution:  
* Add an **IPI child node** (`id:'taxIPI'`) under the existing revenue‑tax root (`tax3`).  
* Store its value (positive, `sign:'-'`).  
* In `pivotRevenueLines` subtract **taxRoot – IPI** instead of the whole root.

---
## 1 SQL / aggregation changes
### 1.1  Revenue‑tax query – add separate IPI column
```sql
UNION ALL
SELECT FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS Periodo,
       'taxIPI'                                  AS id,      -- separate child
       SAFE_CAST(parsed_ipi_value AS FLOAT64)    AS valor,
       '-'                                       AS sign
FROM   `...nfe_table...`
WHERE  tipo_operacao='Saída'
  AND  finalidade='Normal/Venda'
  AND  cancelada='Não'
  AND  (nome_cenario='Venda' OR nome_cenario='Inativo')
```
*(Keep your existing query for **tax3** root and other children unchanged.)*

> Ensure this row is **included** even when `parsed_ipi_value` is 0 – harmless.

---
## 2 `pivotRevenueTaxes()` helper
Append:
```ts
if (row.id==='taxIPI') {
  ipiNode.values[m] += row.valor;
} else {
  taxRoot.values[m] += row.valor;
}
```
Return array should be `[taxRoot, ipiNode, ...otherChildren]` so the IPI line appears in the UI.

Set meta:
```ts
ipiNode.sign='-'; ipiNode.parentId='tax3'; ipiNode.label='IPI';
```

---
## 3 `pivotRevenueLines` – adjust Net‑Revenue formula
Add lookup:
```ts
const ipiNode = taxNodes.find(n=>n.id==='taxIPI')!;
```
Replace formula:
```diff
- net.values[m] = nodes['1'].values[m] - taxRoot.values[m] - nodes['5'].values[m];
+ const nonIpiTax = taxRoot.values[m] - ipiNode.values[m];
+ net.values[m] = nodes['1'].values[m] - nonIpiTax - nodes['5'].values[m];
```
*(Keep `net.sign='+'`, styling unchanged.)*

---
## 4 UI – nothing to change
* The new child node “IPI” inherits group styling; expands under *Impostos sobre receita*.  
* Because `pivotRevenueLines` no longer subtracts IPI, the Net‑Revenue row remains correct.

---
## 5 Validation checklist
1. Expand **Impostos sobre receita** → “IPI” line is visible with its value.  
2. Net‑Revenue in Jan 2025 equals **Gross – (All taxes except IPI) – Descontos** (verify against Excel).  
3. Margem % and downstream intermediate rows unchanged.  
4. IPI cell is positive (table rule).  
5. Clicking other tax children still opens their product pop‑up; IPI row is non‑leaf so not clickable.

Apply these incremental edits and you’ll have IPI displayed but neutralised in Net‑Revenue.

