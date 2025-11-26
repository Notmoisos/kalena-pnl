# PRD ▸ **V1 Intermediate Rows + Styling**  (fully copy‑paste‑able)

> This file replaces the earlier outline.  Every line you must add, delete, or create is below.

---
## 0 Data‑model tweaks
### 0.1 `lib/pnlLogic.ts` (or wherever `PnLNode` is declared)
```diff
 export type PnLNode = {
   id: string;
   parentId?: string;
   label: string;
   sign?: '+' | '-';
   values: Record<Month, number>;
+  // OPTIONAL extras for UI
+  kind?: 'intermediate' | 'percentage';   // drives styling / formatting
+  className?: string;                     // tailwind row‑level styling
 };
```

---
## 1 SQL deltas  (Revenue taxes)
We keep every NFe row but simply **exclude `parsed_ipi_value` from the sum** so IPI no longer affects Net‑Revenue.  No row‑filter is added.
```sql
SELECT
  FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS Periodo,
  'tax3'                                   AS id,  -- revenue‑tax root
  (SAFE_CAST(parsed_pis_value        AS FLOAT64) +
   SAFE_CAST(parsed_cofins_value     AS FLOAT64) +
   SAFE_CAST(parsed_iss_value        AS FLOAT64) +
   SAFE_CAST(parsed_ir_value         AS FLOAT64) +
   SAFE_CAST(parsed_fcp_value        AS FLOAT64) +
   SAFE_CAST(parsed_icm_dest_value   AS FLOAT64) +
   SAFE_CAST(parsed_icm_remet_value  AS FLOAT64) +
   SAFE_CAST(parsed_icms_value       AS FLOAT64)   -- IPI intentionally **not** included
  ) AS valor
FROM   `...nfe_table...`
WHERE  tipo_operacao='Saída'
  AND  finalidade='Normal/Venda'
  AND  cancelada='Não'
  AND  (nome_cenario='Venda' OR nome_cenario='Inativo')
GROUP BY Periodo;
```
*(If you UNION each tax line separately, simply omit the block for `parsed_ipi_value`.)*

---
## 2 Logic patches
### 2.1 `pivotRevenueLines` – new Net‑Revenue formula
```diff
- net.values[m] = nodes['1'].values[m] + nodes['2'].values[m] + nodes['5'].values[m] + taxRoot.values[m];
+ net.values[m] = nodes['1'].values[m]
+               - taxRoot.values[m]            // subtract taxes (IPI excluded upstream)
+               - nodes['5'].values[m];         // subtract financial discounts
```
Add styling meta:
```ts
net.kind='intermediate';
net.className='bg-blue-900 text-white';
```

### 2.2 `buildIntermediateRows` helper (add below pivots)
```ts
export function buildIntermediateRows(nodes:Record<string,PnLNode>, months:Month[]):{ margem:PnLNode; opIncome:PnLNode; ebitda:PnLNode; netProfit:PnLNode }{
  const percentFmt=(num:number)=>num; // raw % stored – format in table
  const margem: PnLNode={id:'margem',label:'Margem % Receita Líquida',kind:'percentage',className:'bg-blue-900 text-white',values:emptyYear(months[0].slice(0,4) as unknown as number)};
  months.forEach(m=>{
    const bruto=nodes['1'].values[m];
    const net =nodes['6'].values[m];
    margem.values[m]= bruto? (net/bruto)*100 : 0;
  });

  const op: PnLNode={id:'op',label:'Receita Operacional / Operating Income',kind:'intermediate',className:'bg-blue-900 text-white',values:emptyYear(months[0].slice(0,4) as unknown as number)};
  months.forEach(m=>{
    op.values[m]= nodes['6'].values[m] - nodes['7'].values[m] - nodes['8'].values[m] - nodes['9'].values[m] + nodes['10'].values[m];
  });

  const ebitda: PnLNode={id:'ebitda',label:'EBITDA',kind:'intermediate',className:'bg-blue-900 text-white',values:emptyYear(months[0].slice(0,4) as unknown as number)};
  months.forEach(m=>{
    ebitda.values[m]= op.values[m]
      - groups['imp'].values[m]   // 2.01 Importação (id imp)
      - groups['pessoal'].values[m]
      - groups['geral'].values[m]
      - groups['mkt'].values[m]
      - groups['opServ'].values[m]
      - groups['trade'].values[m]
      - groups['srv'].values[m];
  });

  const netProfit: PnLNode={id:'netprofit',label:'Lucro Líquido / Net Profit',kind:'intermediate',className:'bg-blue-900 text-white',values:emptyYear(months[0].slice(0,4) as unknown as number)};
  months.forEach(m=>{
    netProfit.values[m]= ebitda.values[m] - groups['fin6'].values[m] - groups['fin2'].values[m];
  });
  return { margem, opIncome:op, ebitda, netProfit };
}
```
*(Replace `groups[...]` with actual ids from your build.)*

### 2.3 Row order in `buildPnl` (simplified sketch)
```ts
const { margem, opIncome, ebitda, netProfit } = buildIntermediateRows(allNodes, months);
return [
  nodes['1'], nodes['2'], taxRoot, ...taxChildren, nodes['5'],        // revenue part
  nodes['6'], margem,                                                // Net Revenue + margin
  nodes['7'], nodes['8'], nodes['9'], nodes['10'], opIncome,         // COGS then Operating Income
  groups['imp'],                                                     // 2.01 Importação
  /* other expense groups 2.03 .. 2.09 */
  ebitda,
  groups['fin6'],  // 2.06 Financeiras
  groups['fin2'],  // 2.02 Tributárias
  netProfit,
  groups['other'] // 2.10 Desconsiderados
];
```

---
## 3 Table styling & formatting
### 3.1 `components/PnLTable.tsx`
Add formatter for percentage rows:
```tsx
const renderVal=(row:Row<PnLNode>,m:Month)=>{
  const val=row.original.values[m]||0;
  if(row.original.kind==='percentage')
    return Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1}).format(val/100);
  return fmt(val);
};
```
Apply row class:
```tsx
<tr key={row.id} className={clsx('border-b last:border-0', row.original.className)}>
```
Disable expand/click:
```tsx
const isLeaf = !row.getCanExpand() && row.original.kind !== 'intermediate' && row.original.kind !== 'percentage';
```

---
## 4 Group re‑ordering is handled in new return array (see 2.3).

---
## 5 Validation
1. Net Revenue row & background dark‑blue.  
2. Margem % shows e.g. “34,8 %”.  
3. Operating Income row appears after CPV Devoluções.  
4. EBITDA row dark‑blue; Financeiras & Tributárias blocks moved beneath; Net Profit dark‑blue.  
5. Desconsiderados now at bottom.  
6. Totals match Excel sheet.

**Paste these diffs exactly; restart dev; v1 layout complete.**

