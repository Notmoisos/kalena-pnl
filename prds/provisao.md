
# PRD / TRD: Move IRPJ & CSLL to new “Impostos / Taxes” section

> IMPLEMENTATION **NOT** INCLUDED – design only.

---

## 0. Overview  

Today the IRPJ & CSLL expenses live inside the expense group **2.06 + Financeiras**.  
They must be removed and shown in a new **“Impostos / Taxes”** group that appears immediately after **2.02 + Tributárias** and feeds into the **Lucro Líquido / Net Profit** calculation.

```
…               
2.02 + Tributárias
Impostos / Taxes          ⬅️ NEW
    ├─ CSLL – Considerar
    ├─ CSLL – Lançamento
    ├─ CSLL – Provisão
    ├─ IRPJ – Considerar
    ├─ IRPJ – Lançamento
    └─ IRPJ – Provisão
Receitas Financeiras / Financial Revenues	
…
```

*No rows in this subtree are expandable.*

---

## 1. Data Sources

| Item                              | Source                                                    | Notes |
|----------------------------------|-----------------------------------------------------------|-------|
| CSLL / IRPJ “Lançamento” values  | existing Omie `despesas` query (today under 2.06)         | same filters; we just map them elsewhere |
| Gross Revenue                    | node `1` (“Receita Bruta”) already present in `buildPnl`  | month-level record |
| Financial-revenue service income | `getFinancialRevenueData` rows where `cat.codigo = '1.02.01'` | “receitas serviço” |
| Financial-revenue taxable income | `getFinancialRevenueData` rows where `cat.categoria_superior = '1.02' && cat.codigo != '1.02.01'` | “receitas financeiras tributáveis” |

---

## 2. Formulas

### 2.1. CSLL – Provisão  

```
CSLL = (9 % × 12 %) × GrossRev
     + 2,88 % × receitas_serviço
     + 9 % × receitas_financeiras_tributáveis
```

### 2.2. IRPJ – Provisão  

```
LucroPresumido = 8 % × GrossRev                 // base
IRPJ_base      = 15 % × LucroPresumido
Adicional      = 10 % × max(LucroPresumido – 20 000, 0)
IRPJ_financais = 25 % × receitas_financeiras_tributáveis
IRPJ_serviço   = 4,8 % × receitas_serviço

IRPJ = IRPJ_base + Adicional
     + IRPJ_financais + IRPJ_serviço
```

### 2.3. “Considerar” logic  

For each tax & month  
```
Considerar = (Lançamento ≠ 0) ? Lançamento : Provisão
```

`Considerar` (CSLL + IRPJ) is what impacts **Lucro Líquido** (negative sign).

---

## 3. Backend Changes (step-by-step)

### 3.1. `lib/despesas.ts` (if needed)  
Make sure CSLL & IRPJ rows are still fetched but *do not* aggregate into 2.06 group.  
Easiest: after fetching, **filter out** categories whose description matches `IRPJ%` or `CSLL%` and store them separately.

```ts
// New helper in despesas.ts
export async function fetchTaxExpenses(year: number) {
  /* same SQL with WHERE categoria_descricao LIKE 'IRPJ%' OR 'CSLL%' */
}
```

### 3.2. `lib/pnlLogic.ts`

1. **Import helpers**  
   ```ts
   import { fetchTaxExpenses } from './despesas';
   ```
2. **Fetch and pivot “Lançamento” rows**  
   ```ts
   const taxExpRows = await fetchTaxExpenses(year);
   const csllLaunch = emptyYearMap();
   const irpjLaunch = emptyYearMap();
   for (const r of taxExpRows){
     (r.categoria_descricao.startsWith('CSLL') ? csllLaunch : irpjLaunch)[r.Periodo as Month] += r.valor;
   }
   ```

3. **Compute receitas_serviço / financeiras_tributáveis**  
   Reuse `frRows` already loaded for financial-revenue node:

   ```ts
   const serv = emptyYearMap();
   const finTax = emptyYearMap();
   for (const fr of frRows){
     if (fr.codigo_categoria === '1.02.01')          serv[fr.ym]   += fr.valor;
     else if (fr.categoria_superior === '1.02')      finTax[fr.ym] += fr.valor;
   }
   ```

4. **Build Provisão maps** (per month):

   ```ts
   const csllProv = emptyYearMap();
   const irpjProv = emptyYearMap();
   months.forEach(m=>{
     const gross    = nodes['1'].values[m];
     const servVal  = serv[m];
     const finVal   = finTax[m];

     csllProv[m] = 0.09*0.12*gross + 0.0288*servVal + 0.09*finVal;

     const lucroPres = 0.08*gross;
     const irBase    = 0.15*lucroPres;
     const adicional = 0.10*Math.max(lucroPres-20000,0);
     irpjProv[m] = irBase + adicional + 0.048*servVal + 0.25*finVal;
   });
   ```

5. **Derive “Considerar” maps**

   ```ts
   const csllConsider = combine(csllLaunch, csllProv);
   const irpjConsider = combine(irpjLaunch, irpjProv);
   function combine(launch:RecMap, prov:RecMap){
     const r=emptyYearMap();
     months.forEach(m=>{
       r[m]= launch[m]!==0 ? launch[m] : prov[m];
     });
     return r;
   }
   ```

6. **Create PnL nodes**

   ```ts
   const impostosRoot: PnLNode = { id:'taxes', label:'Impostos / Taxes', sign:'-', values:emptyYear(year) };

   const mk = (id:string, label:string, src:RecMap):PnLNode => ({ id, parentId:'taxes', label, sign:'-', values:src });

   const nodesTaxes = [
     mk('csll_cons','CSLL – Considerar', csllConsider),
     mk('csll_lanc','CSLL – Lancamento', csllLaunch),
     mk('csll_prov','CSLL – Provisao',    csllProv),
     mk('irpj_cons','IRPJ – Considerar', irpjConsider),
     mk('irpj_lanc','IRPJ – Lancamento', irpjLaunch),
     mk('irpj_prov','IRPJ – Provisao',    irpjProv),
   ];
   ```

   Update `impostosRoot.values`:

   ```ts
   months.forEach(m=>{
     impostosRoot.values[m] = -(csllConsider[m] + irpjConsider[m]); // negative sign
   });
   ```

7. **Insert into finalPnlRows**  
   In the big array construction, locate `fin2Group` (2.02 + Tributárias) and splice the taxes block right after it:

   ```ts
   ...(fin2Group ? [fin2Group, impostosRoot, ...nodesTaxes] : []),
   ```

8. **Adjust Net Profit**  
   When calculating `netProfit`, subtract `impostosRoot.values[m]` (already negative) from `netProfit`.

   ```ts
   netProfit.values[m] -= impostosRoot.values[m]; // imposto reduces profit
   ```

9. **Remove CSLL/IRPJ from 2.06**  
   Ensure they were excluded when building `groups` for 2.06.

---

## 4. Front-end Changes (`components/PnLTable.tsx`)

1. **Child map** will automatically include the new subtree because `buildPnl` delivers it.  
2. **Styling**:  
   - The six leaf rows get normal styling (`kind` unset).  
   - Root (`taxes`) can reuse `kind:'group'` or left blank.  
3. **getRowCanExpand** – add `r.id==='taxes'` to allow first-level toggle.  
4. **getSubRows** – no extra code; default childMap works.

No “click-to-modal” behaviour is required.

---

## 5. Validation Checklist

1. Table order:  
   `… 2.02 + Tributárias → Impostos / Taxes → CSLL*, IRPJ* → 2.03 …`
2. CSLL/IRPJ no longer appear in 2.06 + Financeiras.  
3. “Considerar” values = Lançamento when ≠ 0 else Provisão.  
4. `Lucro Líquido` equals previous value minus (CSLL + IRPJ Considerar).  
5. Expand / collapse works for the root only.  
6. Totals reconcile with manual spreadsheet for a sample month.

---

## 6. Roll-out Notes

* Re-run type-checks and unit tests around `buildPnl`.
* Because formulas depend on Gross Revenue node `1`, `buildPnl` must ensure that node is created before tax calculations.
* Double-check the BigQuery category codes (`1.02.01`, `1.02`) match production data.

