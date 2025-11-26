# PRD ▸ Cost‑of‑Goods (COGS) Lines + NFe Drill‑Down

Adds four COGS rows directly **below Receita Líquida** and enables the same product‑popup behaviour.  All numbers are derived from NFe data (`parsed_unit_cost × parsed_quantity_units`).

| id | Sign | Label | Filter set |
|----|------|-------|------------|
| **7** | + | CPV | Saída · Normal/Venda · Não cancelada · (Venda\|Inativo) |
| **8** | + | CPV Bonificações e Amostras | Saída · Normal/Venda · Não cancelada · nome_cenario=Bonificação |
| **9** | + | Perdas e Descartes | Saída · Normal/Venda · Não cancelada · nome_cenario=Baixa de estoque - Perda |
| **10** | – | CPV Devoluções | finalidade=Devolução · Não cancelada |

*(Signs already applied in SQL – no front‑end negation needed)*

---
## 0  New / changed files
| # | File | Action |
|---|------|--------|
| 1 | **`lib/nfeCosts.ts`** | **CREATE** – BQ helpers for COGS aggregates + drill‑down |
| 2 | **`app/api/cogs-details/route.ts`** | **CREATE** – REST endpoint for product popup |
| 3 | **`lib/pnlLogic.ts`** | **MODIFY** – add `pivotCogsLines()` and insert after Net Revenue |
| 4 | **`components/NfeDetailsModal.tsx`** | **MODIFY** – widen union type `kind` to accept new COGS kinds |
| 5 | **`components/PnLTable.tsx`** | **MODIFY** – include ids 7‑10 in click mapping |
| 6 | **`app/pnl/page.tsx`** | **MODIFY** – extend handler & modal params list |

---
## 1  `lib/nfeCosts.ts` *(new file)*
```ts
import { BigQuery } from '@google-cloud/bigquery';
const bq=new BigQuery({ projectId:process.env.BQ_PROJECT_ID, keyFilename:process.env.BQ_KEYFILE });
export type CogsKind='CPV'|'CPV_Boni'|'Perdas'|'CPV_Devol';
export interface CogsAgg{Periodo:string;kind:CogsKind;valor:number;}
export interface CogsDetail{produto:string;n_nfes:number;valor_total:number;}

export async function fetchCogsAggregates(year:number):Promise<CogsAgg[]>{
  const sql=`WITH base AS (
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH) AS p,'CPV' AS k,
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64) amt
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'CPV_Boni',
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'Perdas',
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Baixa de estoque - Perda'
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'CPV_Devol',
           -SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE finalidade='Devolução' AND cancelada='Não')
  SELECT FORMAT_DATE('%Y-%m',p) Periodo,k kind,SUM(amt) valor
  FROM base WHERE EXTRACT(YEAR FROM p)=@year GROUP BY Periodo,kind`;
  const [rows]=await bq.query<CogsAgg>({query:sql,params:{year}}); return rows;
}

export async function fetchCogsDetails(ym:string,kind:CogsKind):Promise<CogsDetail[]>{
  const filter=kind==='CPV'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`:
               kind==='CPV_Boni'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'`:
               kind==='Perdas'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Baixa de estoque - Perda'`:
               /* devol */     `finalidade='Devolução' AND cancelada='Não'`;
  const sign=kind==='CPV_Devol'?'-':'';
  const sql=`SELECT parsed_x_prod_value produto,COUNT(*) n_nfes,${sign}SUM(parsed_unit_cost*parsed_quantity_units) valor_total
             FROM \`${process.env.BQ_TABLE}\` WHERE ${filter} AND FORMAT_DATE('%Y-%m',DATE(data_emissao))=@ym
             GROUP BY produto ORDER BY valor_total DESC LIMIT 300`;
  const [rows]=await bq.query<CogsDetail>({query:sql,params:{ym}});return rows;
}
```

---
## 2  `app/api/cogs-details/route.ts`
```ts
import { NextResponse } from 'next/server';
import { fetchCogsDetails, CogsKind } from '@/lib/nfeCosts';
export async function GET(req:Request){
  const p=new URL(req.url).searchParams; const ym=p.get('ym')??''; const kind=p.get('kind')??'';
  if(!/^\d{4}-\d{2}$/.test(ym)||!['CPV','CPV_Boni','Perdas','CPV_Devol'].includes(kind))
    return NextResponse.json({error:'bad params'},{status:400});
  return NextResponse.json(await fetchCogsDetails(ym,kind as CogsKind));
}
```

---
## 3  `lib/pnlLogic.ts` patches
### 3.1 import and new pivot
```ts
import { fetchCogsAggregates } from '@/lib/nfeCosts';
```
Add after `pivotRevenueLines`:
```ts
export async function pivotCogsLines(year:number):Promise<PnLNode[]>{
  const raw=await fetchCogsAggregates(year); const months=Object.keys(emptyYear(year)) as Month[];
  const map:{[k:string]:PnLNode}={
    '7':{id:'7',label:'CPV',sign:'+',values:emptyYear(year)},
    '8':{id:'8',label:"CPV Bonificações e Amostras",sign:'+',values:emptyYear(year)},
    '9':{id:'9',label:'Perdas e Descartes',sign:'+',values:emptyYear(year)},
    '10':{id:'10',label:'CPV Devoluções',sign:'-',values:emptyYear(year)},
  };
  raw.forEach(r=>{const id=r.kind==='CPV'?'7':r.kind==='CPV_Boni'?'8':r.kind==='Perdas'?'9':'10';
    map[id].values[r.Periodo as Month]+=r.valor;});
  return Object.values(map);
}
```
### 3.2 buildPnl insert
```diff
- const pnl=[...revenueLines,...expenseLines]
+ const cogsLines=await pivotCogsLines(year);
+ const pnl=[...revenueLines,...cogsLines,...expenseLines]
  return pnl;
```

---
## 4  `components/NfeDetailsModal.tsx` change kind union
```diff
- params:{ ym:string; kind:'ReceitaBruta'|'Devolucao'|'Desconto'}|null;
+ params:{ ym:string; kind:'ReceitaBruta'|'Devolucao'|'Desconto'|'CPV'|'CPV_Boni'|'Perdas'|'CPV_Devol'}|null;
```
Fetch URL decides endpoint:
```diff
- fetch(`/api/nfe-details?ym=${params.ym}&kind=${params.kind}`)
+ const api=params.kind.startsWith('CPV')?'/api/cogs-details':'/api/nfe-details';
+ fetch(`${api}?ym=${params.ym}&kind=${params.kind}`)
```

---
## 5  `components/PnLTable.tsx` click mapping
Inside click handler map row ids → kind:
```ts
const revMap:any={1:'ReceitaBruta',2:'Devolucao',5:'Desconto',7:'CPV',8:'CPV_Boni',9:'Perdas',10:'CPV_Devol'};
...
if(revMap[row.original.id]) onCellClick({ym:m,rowId:row.original.id, kind:revMap[row.original.id]});
```
Update prop type again:
```ts
onCellClick:(ctx:{ym:Month;rowId:string;kind?:string})=>void;
```

---
## 6  `app/pnl/page.tsx` handler
```diff
- if(['1','2','5'].includes(rowId)){
-   const map={1:'ReceitaBruta',2:'Devolucao',5:'Desconto'} as any;
+ if(['1','2','5','7','8','9','10'].includes(rowId)){
+   const map={1:'ReceitaBruta',2:'Devolucao',5:'Desconto',7:'CPV',8:'CPV_Boni',9:'Perdas',10:'CPV_Devol'} as any;
    setNfeParams({ym,kind:map[rowId]}); setNfeOpen(true); return; }
```
Endpoint selection already in modal (see §4 change).

Render modal unchanged.

---
## 7  Validation checklist
1. Table shows four new rows (ids 7‑10) under Net Revenue.  
2. Values reconcile with spreadsheet for Jan‑Mar 2025.  
3. Clicking any COGS cell opens product popup (via `/api/cogs-details`).  
4. Totals in popup equal cell value.  
5. Old revenue & despesa popups still function.

---
**Copy each code block into its file; rebuild; COGS lines and drill‑downs will be live.**

