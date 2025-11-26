# PRD ▸ **Flatten Revenue + NFe Product Drill‑Down**  (v2 – fully explicit)

This document supersedes previous drafts.  It contains **only** the lines you must add, delete, or create.  Follow the table of files in order.

| # | File (path) | Action | Lines to add / replace |
|---|-------------|--------|------------------------|
| 1 | **`lib/nfeRevenue.ts`** | **CREATE** | *copy entire contents in §1.1* |
| 2 | **`app/api/nfe-details/route.ts`** | **CREATE** | *copy §1.2* |
| 3 | **`components/NfeDetailsModal.tsx`** | **CREATE** | *copy §1.3* |
| 4 | **`lib/pnlLogic.ts`** | **MODIFY** | *apply patch in §2.1 + §2.2* |
| 5 | **`components/PnLTable.tsx`** | **MODIFY** | *apply patch in §3* |
| 6 | **`app/pnl/page.tsx`** | **MODIFY** | *apply patch in §4* |

---
## 1  New files
### 1.1 `lib/nfeRevenue.ts`
*(full file)*
```ts
import { BigQuery } from '@google-cloud/bigquery';
const bq = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, keyFilename: process.env.BQ_KEYFILE });
export type RevKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto';
export interface RevAgg { Periodo:string; kind:RevKind; valor:number; }
export interface NfeDetail { produto:string; n_nfes:number; valor_total:number; }

export async function fetchRevenueAggregates(year:number):Promise<RevAgg[]> {
  const sql = `WITH base AS (
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period,'ReceitaBruta' AS kind,
           SAFE_CAST(parsed_total_product_value AS FLOAT64) AS amount
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH),'Devolucao',
           -SAFE_CAST(parsed_total_product_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE finalidade='Devolução' AND cancelada='Não'
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH),'Desconto',
           -SAFE_CAST(parsed_discount_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo') )
  SELECT FORMAT_DATE('%Y-%m', period) AS Periodo, kind, SUM(amount) AS valor
  FROM base WHERE EXTRACT(YEAR FROM period)=@year GROUP BY Periodo, kind`;
  const [rows]=await bq.query<RevAgg>({query:sql,params:{year}}); return rows;
}

export async function fetchNfeDetails(ym:string, kind:RevKind):Promise<NfeDetail[]> {
  const filter = kind==='ReceitaBruta'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`:
                 kind==='Devolucao'?`finalidade='Devolução' AND cancelada='Não'`:
                 `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
  const sign = kind==='Devolucao'?'-':'';
  const sql=`SELECT parsed_x_prod_value AS produto, COUNT(*) AS n_nfes, ${sign}SUM(parsed_total_product_value) AS valor_total
             FROM \`${process.env.BQ_TABLE}\`
             WHERE ${filter} AND FORMAT_DATE('%Y-%m', DATE(data_emissao))=@ym
             GROUP BY produto ORDER BY valor_total DESC LIMIT 300`;
  const [rows]=await bq.query<NfeDetail>({query:sql,params:{ym}}); return rows;
}
```

### 1.2 `app/api/nfe-details/route.ts`
```ts
import { NextResponse } from 'next/server';
import { fetchNfeDetails, RevKind } from '@/lib/nfeRevenue';
export async function GET(req:Request){
  const p=new URL(req.url).searchParams;
  const ym=p.get('ym')??''; const kind=p.get('kind')??'';
  if(!/^\d{4}-\d{2}$/.test(ym)||!['ReceitaBruta','Devolucao','Desconto'].includes(kind))
    return NextResponse.json({error:'bad params'},{status:400});
  return NextResponse.json(await fetchNfeDetails(ym,kind as RevKind));
}
```

### 1.3 `components/NfeDetailsModal.tsx`
*(full file, copy from earlier message)*

---
## 2  `lib/pnlLogic.ts` patches
### 2.1 **New import & pivot function** (insert near other imports)
```ts
import { fetchRevenueAggregates } from '@/lib/nfeRevenue';
```

Add **pivotRevenueLines** implementation (replace old revenue builder):
```ts
export async function pivotRevenueLines(year:number):Promise<PnLNode[]>{
  const raw=await fetchRevenueAggregates(year);
  const months=Object.keys(emptyYear(year)) as Month[];
  const nodes:{[k:string]:PnLNode}={
    '1':{id:'1',label:'Receita Bruta / Gross Revenue',sign:'+',values:emptyYear(year)},
    '2':{id:'2',label:'Devoluções / Returns',sign:'-',values:emptyYear(year)},
    '5':{id:'5',label:'Descontos Financeiros',sign:'-',values:emptyYear(year)},
  };
  raw.forEach(r=>{const m=r.Periodo as Month; const id=r.kind==='ReceitaBruta'?'1':r.kind==='Devolucao'?'2':'5'; nodes[id].values[m]+=r.valor;});
  const taxNodes=await pivotRevenueTaxes(year); // existing helper, returns tax3 root + children
  const taxRoot=taxNodes.find(n=>n.id==='tax3')!;
  const net:{id:string;label:string;values:Record<Month,number>;sign:'+'}={id:'6',label:'Receita Líquida / Net Revenue',sign:'+',values:emptyYear(year)} as any;
  months.forEach(m=>{net.values[m]=nodes['1'].values[m]+nodes['2'].values[m]+nodes['5'].values[m]+taxRoot.values[m];});
  return [nodes['1'],nodes['2'],...taxNodes,nodes['5'],net];
}
```
### 2.2 **buildPnl** – remove `rev` wrapper
```diff
- const revenueLines=await pivotRevenue(year)
- const revenueRoot: PnLNode={id:'rev',label:'Revenue',values:emptyYear(year)}
- // sum children...
- return [revenueRoot,...revenueLines,...expenseLines]
+ const revenueLines=await pivotRevenueLines(year)
+ return [...revenueLines,...expenseLines]
```
Remove `rev` id from any `expanded` defaults.

---
## 3  `components/PnLTable.tsx` patch
Inside month cell renderer change click payload:
```diff
- onClick={() => onCellClick({ ym: m, rowId: row.original.id })}
+ onClick={() => onCellClick({ ym: m, rowId: row.original.id })}
```
*(already fixed earlier – ensure it is row.original.id)*

---
## 4  `app/pnl/page.tsx` (client) patch
Add NFe modal state & handler:
```tsx
import NfeDetailsModal from '@/components/NfeDetailsModal';
...
const [nfeOpen,setNfeOpen]=useState(false);
const [nfeParams,setNfeParams]=useState<null|{ym:string;kind:'ReceitaBruta'|'Devolucao'|'Desconto'}>(null);

const openDetailsModal=({ym,rowId}:{ym:string;rowId:string})=>{
  if(['1','2','5'].includes(rowId)){
    const map:any={1:'ReceitaBruta',2:'Devolucao',5:'Desconto'};
    setNfeParams({ym,kind:map[rowId]}); setNfeOpen(true); return;
  }
  /* existing despesa logic here */
};
...
<NfeDetailsModal open={nfeOpen} params={nfeParams} onClose={()=>setNfeOpen(false)} />
```

---
## 5  Validation checklist
- Table now shows 1,2,5,6 (no “Revenue” row).  
- Net Revenue formula = Bruta + Devolução + Desconto + tax3 root (negative).  
- Clicking Bruta/Devoluções/Descontos opens product popup.  
- Popup totals match cell values (manual check).  
- Existing despesa popups still work.

**Apply exactly these changes; nothing else is required.**

