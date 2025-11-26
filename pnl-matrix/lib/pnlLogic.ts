import { nfe, despesa } from './mockData';
import { fetchDespesas } from './despesas'
import { fetchTaxExpenses } from './despesas'
import { fetchRevenueTaxRows, fetchStTaxRows, RawTax } from './nfe'
import { fetchRevenueAggregates } from '@/lib/nfeRevenue';
import { fetchJurosMultaAggregates } from '@/lib/nfeRevenue';
import { fetchCogsAggregates } from '@/lib/nfeCosts';
import { getFinancialRevenueData, FinancialRevenueRow } from './financialRevenue';
import { extraTax3Rows, ExtraTaxRow } from './taxExtras2025';
import { extraTax4Rows } from './taxExtras2025';

export type Month = `${number}-${'01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'|'09'|'10'|'11'|'12'}`;
export type PnLNode = {
  id: string;
  parentId?: string;
  label: string;
  sign?: '+' | '-';
  values: Record<Month, number>; // month → amount
  // OPTIONAL extras for UI
  kind?: 'intermediate' | 'percentage' | 'family' | 'loading' | 'detailPercentage' | 'volume_parent' | 'group';   // drives styling / formatting
  className?: string;                     // tailwind row‑level styling
  meta?: {
    frBySup: { supLabel: string; vals: Record<Month, number>; cats: { catLabel: string; vals: Record<Month, number> }[] }[];
  };
};

// Utility: init months with 0
export const emptyYear = (year: number) =>
  Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [
      `${year}-${String(i + 1).padStart(2, '0')}` as Month,
      0
    ])
  ) as Record<Month, number>;

/** Build a minimal P&L tree for the selected year from mock data */
export function buildMockPnl(year: number): PnLNode[] {
  const grossRev: PnLNode = {
    id: '1',
    label: 'Receita Bruta',
    values: emptyYear(year)
  };
  const returns: PnLNode = {
    id: '2',
    label: 'Devoluções',
    sign: '-',
    values: emptyYear(year)
  };
  const netRev: PnLNode = {
    id: '6',
    parentId: 'rev',
    label: 'Receita Líquida',
    values: emptyYear(year)
  };

  //  🚧  Very naive aggregation just to have numbers
  nfe.forEach((row) => {
    const month = row.data_emissao.slice(0, 7) as Month;
    if (month.startsWith(String(year))) {
      grossRev.values[month] += Number(row.parsed_total_item_value);
      // mock: no returns yet
    }
  });
  Object.keys(grossRev.values).forEach((m) => {
    netRev.values[m as Month] = grossRev.values[m as Month] - returns.values[m as Month];
  });

  return [
    { id: 'rev', label: 'Revenue', values: emptyYear(year) },
    grossRev,
    returns,
    netRev
  ];
}

function buildTaxTree(raw: RawTax[], rootId: 'tax3' | 'tax4', rootLabel: string): PnLNode[] {
  const rootYear = parseInt(raw[0]?.Periodo.slice(0, 4) ?? '2025')
  const months = Object.keys(emptyYear(rootYear)) as Month[]
  const root: PnLNode = { id: rootId, label: rootLabel, sign: '-', values: emptyYear(rootYear) }
  const map: Record<string, PnLNode> = {}

  for (const r of raw) {
    const m = r.Periodo as Month;
    // collapse all IPI scenarios into a single node 'taxIPI'
    const childId = r.tax_name === 'IPI'
      ? 'taxIPI'
      : `${rootId}_${r.tax_name}_${r.scenario}`;

    if (!map[childId]) {
      // --- START OF FIX ---
      // Determine the initial sign based on the scenario type
      let initialSign: '+' | '-' = '+'; // Default to positive for Venda, Bonificacao etc.
      if (r.scenario === 'Devolucao') {
        initialSign = '-'; // Returns/Devolucao typically imply a negative financial impact
      }
      // --- END OF FIX ---

      map[childId] = r.tax_name === 'IPI'
        ? {
            id: 'taxIPI',
            parentId: rootId,
            label: 'IPI',
            sign: '-', // Assuming IPI is always a deduction/cost, as per your original code
            values: emptyYear(rootYear)
          }
        : {
            id: childId,
            parentId: rootId,
            label: `${r.tax_name} ${r.scenario === 'Venda' ? '' : r.scenario}`.trim(),
            // Use the semantically determined sign here
            sign: initialSign,
            values: emptyYear(rootYear)
          };
    }
    // JavaScript correctly coerces 'null' to 0 in arithmetic operations, so no change needed here
    map[childId].values[m] += r.valor;
    // only non-IPI taxes accumulate in root
    if (r.tax_name !== 'IPI') root.values[m] += r.valor;
  }
  // ensure IPI child appears immediately under root
  const allChildren = Object.values(map);
  const ipiChild = allChildren.filter(n => n.id === 'taxIPI');
  const otherChildren = allChildren.filter(n => n.id !== 'taxIPI');
  return [root, ...ipiChild, ...otherChildren];
}

export async function pivotRevenueTaxes(year: number): Promise<PnLNode[]> {
  const nodes = buildTaxTree(await fetchRevenueTaxRows(year), 'tax3', 'Impostos sobre receita');
  // Merge hardcoded Impostos sobre receita for January 2025
  if (year === 2025) mergeTaxExtras(nodes, extraTax3Rows);
  return nodes;
}

export async function pivotStTaxes(year: number): Promise<PnLNode[]> {
  const nodes = buildTaxTree(await fetchStTaxRows(year), 'tax4', 'Impostos ST');
  // Merge hardcoded Impostos ST for January 2025
  if (year === 2025) mergeTaxExtras(nodes, extraTax4Rows);
  return nodes;
}

async function pivotRevenue(year: number): Promise<PnLNode[]> {
  const months = Object.keys(emptyYear(year)) as Month[]

  // You will need to implement or adapt the gross, returns, and discount logic as per your app's needs
  const gross: PnLNode = { id: '1', parentId: 'rev', label: 'Receita Bruta', values: emptyYear(year) }
  const returns: PnLNode = { id: '2', parentId: 'rev', label: 'Devoluções', sign: '-', values: emptyYear(year) }
  const discount: PnLNode = { id: '5', parentId: 'rev', label: 'Descontos Financeiros', sign: '-', values: emptyYear(year) }

  // 🆕 fetch per‑tax trees
  const revenueTaxNodes = await pivotRevenueTaxes(year)   // tax3 root + children
  const stTaxNodes      = await pivotStTaxes(year)        // tax4 root + children

  const taxRoot = revenueTaxNodes.find((n) => n.id === 'tax3')!

  const net: PnLNode = {
    id: '6', parentId: 'rev', label: 'Receita Líquida', values: emptyYear(year)
  }
  months.forEach((m) => {
    net.values[m] = gross.values[m] + returns.values[m] + taxRoot.values[m] + discount.values[m]
  })

  return [
    gross,
    returns,
    ...revenueTaxNodes,
    ...stTaxNodes,
    discount,
    net,
  ]
}

export async function pivotRevenueLines(year:number):Promise<PnLNode[]> {
  const raw=await fetchRevenueAggregates(year);
  const months=Object.keys(emptyYear(year)) as Month[];
  const nodes:{[k:string]:PnLNode}={
    '1':{id:'1',label:'Receita Bruta',sign:'+',values:emptyYear(year)},
    '2':{id:'2',label:'Devoluções',sign:'-',values:emptyYear(year)},
    '5':{id:'5',label:'Descontos Financeiros',sign:'-',values:emptyYear(year)},
  };
  raw.forEach(r=>{const m=r.Periodo as Month; const id=r.kind==='ReceitaBruta'?'1':r.kind==='Devolucao'?'2':'5'; nodes[id].values[m]+=r.valor;});

  // Hardcode additional Devolucoes for 2025-01
  if (year === 2025) {
    const monthKey = '2025-01' as Month;
    nodes['2'].values[monthKey] += 20735.35;
  }

  // Hardcode additional Receita Bruta for 2025-01
  if (year === 2025) {
    const monthKey = '2025-01' as Month;
    nodes['1'].values[monthKey] += 1168710.89;
  }

  // Hardcode additional Descontos Financeiros for 2025-01
  if (year === 2025) {
    const monthKey = '2025-01' as Month;
    nodes['5'].values[monthKey] += 22088.14;
  }

  // Subtract Returns from Gross Revenue so that node '1' = Gross Sales – Returns
  months.forEach(m => {
    nodes['1'].values[m] -= nodes['2'].values[m];
  });

  const revenueTaxNodes = await pivotRevenueTaxes(year); // tax3 root + children
  const stTaxNodes      = await pivotStTaxes(year);        // tax4 root + children
  const taxRoot = revenueTaxNodes.find(n => n.id === 'tax3')!;
  const net: PnLNode = { id: '6', label: 'Receita Líquida', sign: '+', values: emptyYear(year) };
  months.forEach(m => {
    net.values[m] = nodes['1'].values[m] - taxRoot.values[m] - nodes['5'].values[m];
  });
  net.kind = 'intermediate';
  net.className = 'bg-blue-900 text-white';
  return [
    nodes['1'],
    nodes['2'],
    ...revenueTaxNodes,
    ...stTaxNodes,
    nodes['5'],
    net,
  ];
}

export async function pivotCogsLines(year:number):Promise<PnLNode[]> {
  const raw=await fetchCogsAggregates(year); const months=Object.keys(emptyYear(year)) as Month[];
  const map:{[k:string]:PnLNode}={
    '7':{id:'7',label:'CPV',sign:'+',values:emptyYear(year)},
    '8':{id:'8',label:"CPV Bonificações e Amostras",sign:'+',values:emptyYear(year)},
    '9':{id:'9',label:'Perdas e Descartes',sign:'+',values:emptyYear(year)},
    '10':{id:'10',label:'CPV Devoluções',sign:'-',values:emptyYear(year)},
  };
  raw.forEach(r=>{const id=r.kind==='CPV'?'7':r.kind==='CPV_Boni'?'8':r.kind==='Perdas'?'9':'10';
    map[id].values[r.Periodo as Month]+=r.valor;});

  // Hardcode additional CPV sum for 2025-01
  if (year === 2025) {
    const monthKey = '2025-01' as Month;
    map['7'].values[monthKey] += 624679.4446;
  }

  // Hardcode additional CPV_Boni sum for 2025-01
  if (year === 2025) {
    const monthKey = '2025-01' as Month;
    map['8'].values[monthKey] += 5090.6876;
  }

  // Hardcode additional CPV_Devol sum for 2025-01
  if (year === 2025) {
    const monthKey = '2025-01' as Month;
    map['10'].values[monthKey] += 10689.5083;
  }

  return Object.values(map);
}

export async function pivotDespesas(year: number): Promise<PnLNode[]> {
  const rows = await fetchDespesas(year)
  const months = Object.keys(emptyYear(year)) as Month[]

  const groups: Record<string, PnLNode> = {}
  const subs:   Record<string, PnLNode> = {}

  // Helper to skip duplicate tax expenses in 2.10 + Desconsiderados
  function isIgnoredTaxExpense(raw: any): boolean {
    if (raw.codigo_e_descricao !== '2.10 + Desconsiderados') return false
    const cat = raw.categoria_descricao.trim().toUpperCase()
    if (cat === 'PIS' || cat === 'COFINS') return true
    return cat.startsWith('ICMS')
  }

  for (const r of rows) {
    if (isIgnoredTaxExpense(r)) continue   // 🚫 skip duplicate tax expenses
    if (!r.codigo_e_descricao || !r.categoria_descricao) continue

    // 🚫 skip CSLL/IRPJ expenses - they are handled separately in the tax section
    if (r.categoria_descricao.includes('CSLL') || r.categoria_descricao.includes('IRPJ')) continue

    const groupId = `grp_${r.codigo_e_descricao}`
    const subId   = `sub_${r.codigo_e_descricao}__${r.categoria_descricao}`
    const m = r.Periodo as Month
    const v = Number(r.valor_documento)

    // === GROUP (now root) ===
    if (!groups[groupId]) {
      groups[groupId] = {
        id: groupId,
        label: r.codigo_e_descricao,
        sign: '-',
        values: emptyYear(year)
      }
    }
    groups[groupId].values[m] += v

    // === SUB-CATEGORY (child of group) ===
    if (!subs[subId]) {
      subs[subId] = {
        id: subId,
        parentId: groupId,
        label: r.categoria_descricao,
        sign: '-',
        values: emptyYear(year)
      }
    }
    subs[subId].values[m] += v
  }

  // return only groups + subs—no root "Other Expenses"
  return [
    ...Object.values(groups),
    ...Object.values(subs)
  ]
}

export function buildIntermediateRows(
  nodes: Record<string, PnLNode>,
  groups: Record<string, PnLNode>,
  months: Month[]
): {
  margem: PnLNode;
  opIncome: PnLNode;
  lucroBruto: PnLNode;
  ebitda: PnLNode;
  netProfit: PnLNode;
  margemOpIncome: PnLNode;
  margemLucroBruto: PnLNode;
  margemEbitda: PnLNode;
  margemNetProfit: PnLNode;
} {
  const margem: PnLNode = {
    id: 'margem',
    label: 'Margem % Receita Líquida',
    kind: 'percentage',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    const bruto = nodes['1'].values[m];
    const net = nodes['6'].values[m];
    margem.values[m] = bruto ? (net / bruto) * 100 : 0;
  });

  const opIncome: PnLNode = {
    id: 'op',
    label: 'Receita Operacional',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    opIncome.values[m] = nodes['6'].values[m]
      - nodes['7'].values[m]
      - nodes['8'].values[m]
      - nodes['9'].values[m]
      + nodes['10'].values[m];
  });

  const margemOpIncome: PnLNode = {
    id: 'margemOpIncome',
    label: 'Margem % Receita Operacional',
    kind: 'percentage',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    const bruto = nodes['1'].values[m];
    margemOpIncome.values[m] = bruto ? (opIncome.values[m] / bruto) * 100 : 0;
  });

  const lucroBruto: PnLNode = {
    id: 'lucroBruto',
    label: 'Lucro Bruto',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    lucroBruto.values[m] = opIncome.values[m] - (groups['grp_2.07 + Operacionais']?.values[m] || 0);
  });

  const margemLucroBruto: PnLNode = {
    id: 'margemLucroBruto',
    label: 'Margem % Lucro Bruto',
    kind: 'percentage',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    const bruto = nodes['1'].values[m];
    margemLucroBruto.values[m] = bruto ? (lucroBruto.values[m] / bruto) * 100 : 0;
  });

  const ebitda: PnLNode = {
    id: 'ebitda',
    label: 'EBITDA',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    ebitda.values[m] = opIncome.values[m]
      - (groups['grp_2.01 + Importação']?.values[m] || 0)
      - (groups['grp_2.03 + Despesas com Pessoal']?.values[m] || 0)
      - (groups['grp_2.04 + Gerais e administrativas']?.values[m] || 0)
      - (groups['grp_2.05 + Marketing / Comercial']?.values[m] || 0)
      - (groups['grp_2.07 + Operacionais']?.values[m] || 0)
      - (groups['grp_2.08 + Trade Marketing']?.values[m] || 0)
      - (groups['grp_2.09 + Serviços tomados']?.values[m] || 0);
  });

  const margemEbitda: PnLNode = {
    id: 'margemEbitda',
    label: 'Margem % EBITDA',
    kind: 'percentage',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    const liquida = nodes['6'].values[m];
    margemEbitda.values[m] = liquida ? (ebitda.values[m] / liquida) * 100 : 0;
  });

  const netProfit: PnLNode = {
    id: 'netprofit',
    label: 'Lucro Líquido',
    kind: 'intermediate',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    netProfit.values[m] = ebitda.values[m]
      - (groups['grp_2.06 + Financeiras']?.values[m] || 0)
      - (groups['grp_2.02 + Tributárias']?.values[m] || 0);
  });

  const margemNetProfit: PnLNode = {
    id: 'margemNetProfit',
    label: 'Margem % Lucro Liquido',
    kind: 'percentage',
    className: 'bg-blue-900 text-white',
    values: emptyYear(months[0].slice(0, 4) as unknown as number)
  };
  months.forEach(m => {
    const liquida = nodes['6'].values[m];
    margemNetProfit.values[m] = liquida ? (netProfit.values[m] / liquida) * 100 : 0;
  });

  return { margem, opIncome, lucroBruto, ebitda, netProfit, margemOpIncome, margemLucroBruto, margemEbitda, margemNetProfit };
}

function createDetailPercentageRow(
  parentRow: PnLNode | undefined,
  receitaBrutaNode: PnLNode,
  months: Month[]
): PnLNode | null {
  if (!parentRow) return null;
  const yearForEmpty = months[0].slice(0, 4) as unknown as number;
  const detailPercNode: PnLNode = {
    id: `${parentRow.id}_percGross`,
    label: '',
    kind: 'detailPercentage',
    values: emptyYear(yearForEmpty)
  };
  months.forEach(m => {
    const parentValue = parentRow.values[m] || 0;
    const receitaBrutaValue = receitaBrutaNode.values[m];
    detailPercNode.values[m] = (receitaBrutaValue && receitaBrutaValue !== 0) ? (parentValue / receitaBrutaValue) * 100 : 0;
  });
  return detailPercNode;
}

export function buildDetailPercentageRows(
  nodes: Record<string, PnLNode>,
  groups: Record<string, PnLNode>,
  taxRoot: PnLNode | undefined,
  months: Month[]
): Record<string, PnLNode> {
  const receitaBrutaNode = nodes['1'];
  if (!receitaBrutaNode) return {};
  const detailPercentageNodes: Record<string, PnLNode> = {};
  const createAndStore = (parentNode: PnLNode | undefined) => {
    const node = createDetailPercentageRow(parentNode, receitaBrutaNode, months);
    if (node) detailPercentageNodes[node.id] = node;
  };
  // a. Impostos sobre receita
  createAndStore(taxRoot);
  // b. Descontos Financeiros
  createAndStore(nodes['5']);
  // Helper to find specific groups by label substring
  const findGroup = (labelSubstring: string) => Object.values(groups).find(g => g.label.includes(labelSubstring));
  // c. 2.07 + Operacionais
  createAndStore(findGroup('2.07 + Operacionais'));
  // d. 2.01 + Importação
  createAndStore(findGroup('2.01 + Importação'));
  // e. 2.03 + Despesas com Pessoal
  createAndStore(findGroup('2.03 + Despesas com Pessoal'));
  // f. 2.04 + Gerais e administrativas
  createAndStore(findGroup('2.04 + Gerais e administrativas'));
  // g. 2.05 + Marketing / Comercial
  createAndStore(findGroup('2.05 + Marketing / Comercial'));
  // i. 2.08 + Trade Marketing
  createAndStore(findGroup('2.08 + Trade Marketing'));
  // j. 2.09 + Serviços tomados
  createAndStore(findGroup('2.09 + Serviços tomados'));
  // k. 2.06 + Financeiras
  createAndStore(findGroup('2.06 + Financeiras'));
  // l. 2.02 + Tributárias
  createAndStore(findGroup('2.02 + Tributárias'));

  // m. COGS / CPV groups
  createAndStore(nodes['7']);   // CPV
  createAndStore(nodes['8']);   // CPV Bonificações e Amostras
  createAndStore(nodes['9']);   // Perdas e Descartes
  createAndStore(nodes['10']);  // CPV Devoluções

  return detailPercentageNodes;
}

// Helper to parse and sum concatenated number strings (if needed)
function parseAndSumFinancialValueString(value: string | number): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value) return 0;
  // Try to split on sequences that look like numbers (e.g., 03133.16, 8087.03, 4680.06)
  // This regex matches numbers with optional leading zeros and two decimals
  const matches = value.match(/\d+\.\d{2}/g);
  if (!matches) return 0;
  return matches.reduce((sum, numStr) => sum + parseFloat(numStr), 0);
}

export async function buildPnl(year: number): Promise<PnLNode[]> {
  const rawRevenue = await pivotRevenueLines(year);
  // insert volume nodes immediately after Gross Revenue and Returns
  const empty = emptyYear(year);
  const volRev: PnLNode = { id: '1_volumes', label: 'Volumes (Receita)', values: empty, kind: 'volume_parent' };
  const volRet: PnLNode = { id: '2_volumes', label: 'Volumes (Devolucoes)', values: empty, kind: 'volume_parent' };
  const revenueLines = rawRevenue.flatMap(n => {
    if (n.id === '1') return [n, volRev];
    if (n.id === '2') return [n, volRet];
    return [n];
  });
  const cogsLines = await pivotCogsLines(year);
  const expenseLines = await pivotDespesas(year);

  // --- Financial Revenue Integration ---
  const months = Object.keys(emptyYear(year)) as Month[];
  const frRows = await getFinancialRevenueData(year);

  // ▪️ fetch "Multa e Juros" sums
  const jurosRows = await fetchJurosMultaAggregates(year);

  const totFR: Record<Month, number> = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  const bySup = new Map<string, { vals: Record<Month, number>, byCat: Map<string, Record<Month, number>> }>();

  // — existing loop: aggregate Omie data into totFR & bySup …
  for (const r of frRows) {
    // r.valor is now a pre-aggregated number from SQL, r.ym is also from SQL.
    // No need for parseAndSumFinancialValueString if SQL CAST and SUM work as expected.
    // Ensure r.valor is treated as a number, just in case DB driver returns string for SUM.
    const valorNum = Number(r.valor) || 0;

    totFR[r.ym] = (totFR[r.ym] || 0) + valorNum;
    const sup = bySup.get(r.categoria_descricao_superior) || (() => {
      const obj = { vals: Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>, byCat: new Map() };
      bySup.set(r.categoria_descricao_superior, obj);
      return obj;
    })();
    sup.vals[r.ym] = (sup.vals[r.ym] || 0) + valorNum;
    const cat = sup.byCat.get(r.categoria_descricao) || (() => {
      const obj = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
      sup.byCat.set(r.categoria_descricao, obj);
      return obj;
    })();
    cat[r.ym] = (cat[r.ym] || 0) + valorNum;
  }

  // — integrate Multa e Juros into totals & sup-group
  const multaVals = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  for (const jr of jurosRows) {
    const ym = jr.Periodo as Month;
    const v = Number(jr.valor) || 0;
    multaVals[ym] += v; 
    totFR[ym] += v; 
  }
  // push as its own supLabel (no cats ⇒ non-expandable)
  bySup.set('Multa e Juros', { vals: multaVals, byCat: new Map() });

  const financialRevenueNode: PnLNode = {
    id: 'financial_revenue',
    label: 'Receitas Financeiras',
    values: totFR,
    kind: 'group',
    meta: {
      frBySup: Array.from(bySup.entries()).map(([supLabel, s]) => ({
        supLabel,
        vals: s.vals,
        cats: Array.from(s.byCat.entries()).map(([catLabel, vals]) => ({ catLabel, vals }))
      }))
    }
  };
  // ---

  // --- CSLL/IRPJ Tax Calculation Integration ---
  // Fetch and pivot "Lançamento" rows
  const taxExpRows = await fetchTaxExpenses(year);
  const csllLaunch = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  const irpjLaunch = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  
  for (const r of taxExpRows) {
    const month = r.Periodo as Month;
    const valor = Number(r.valor_documento) || 0;
    if (r.categoria_descricao.includes('CSLL')) {
      csllLaunch[month] += valor;
    } else if (r.categoria_descricao.includes('IRPJ')) {
      irpjLaunch[month] += valor;
    }
  }

  // Compute receitas_serviço / financeiras_tributáveis
  const serv = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  const finTax = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  
  for (const fr of frRows) {
    const valorNum = Number(fr.valor) || 0;
    if (fr.codigo_categoria === '1.02.01') {
      serv[fr.ym] += valorNum;
    } else if (fr.categoria_superior === '1.02' && fr.codigo_categoria !== '1.02.01') {
      finTax[fr.ym] += valorNum;
    }
  }

  const nodes: Record<string, PnLNode> = {};
  [...revenueLines, ...cogsLines].forEach(n => { nodes[n.id] = n; });

  // Build Provisão maps (per month) - needs nodes['1'] for Gross Revenue
  const csllProv = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  const irpjProv = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  
  months.forEach(m => {
    const gross = nodes['1'].values[m] || 0;
    const servVal = serv[m] || 0;
    const finVal = finTax[m] || 0;

    // CSLL = (9% × 12%) × GrossRev + 2,88% × receitas_serviço + 9% × receitas_financeiras_tributáveis
    csllProv[m] = 0.09 * 0.12 * gross + 0.0288 * servVal + 0.09 * finVal;

    // IRPJ calculation
    const lucroPres = 0.08 * gross;
    const irBase = 0.15 * lucroPres;
    const adicional = 0.10 * Math.max(lucroPres - 20000, 0);
    const irpjFinancais = 0.25 * finVal;
    const irpjServico = 0.048 * servVal;
    
    irpjProv[m] = irBase + adicional + irpjFinancais + irpjServico;
  });

  // Derive "Considerar" maps
  const csllConsider = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  const irpjConsider = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
  
  months.forEach(m => {
    csllConsider[m] = csllLaunch[m] !== 0 ? csllLaunch[m] : csllProv[m];
    irpjConsider[m] = irpjLaunch[m] !== 0 ? irpjLaunch[m] : irpjProv[m];
  });

  // Create PnL nodes for taxes
  const impostosRoot: PnLNode = { 
    id: 'taxes', 
    label: 'Impostos', 
    sign: '-', 
    values: Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>
  };

  const mk = (id: string, label: string, src: Record<Month, number>): PnLNode => ({ 
    id, 
    parentId: 'taxes', 
    label, 
    sign: '-', 
    values: src 
  });

  const nodesTaxes = [
    mk('csll_cons', 'CSLL – Considerar', csllConsider),
    mk('csll_lanc', 'CSLL – Lançamento', csllLaunch),
    mk('csll_prov', 'CSLL – Provisão', csllProv),
    mk('irpj_cons', 'IRPJ – Considerar', irpjConsider),
    mk('irpj_lanc', 'IRPJ – Lançamento', irpjLaunch),
    mk('irpj_prov', 'IRPJ – Provisão', irpjProv),
  ];

  // Update impostosRoot.values with sum of "Considerar" values
  months.forEach(m => {
    impostosRoot.values[m] = csllConsider[m] + irpjConsider[m];
  });
  // ---

  const groups: Record<string, PnLNode> = {};
  expenseLines.forEach(n => { if (n.id.startsWith('grp_')) groups[n.id] = n; });

  const { margem, opIncome, lucroBruto, ebitda, netProfit, margemOpIncome, margemLucroBruto, margemEbitda, margemNetProfit } =
    buildIntermediateRows(nodes, groups, months);

  const taxRootNode = revenueLines.find(n => n.id === 'tax3');
  const taxChildren = revenueLines.filter(n => n.parentId === 'tax3');
  const stRootNode = revenueLines.find(n => n.id === 'tax4');
  const stChildren = revenueLines.filter(n => n.parentId === 'tax4');

  const detailPercRowsMap = buildDetailPercentageRows(nodes, groups, taxRootNode, months);
  const getDetailPerc = (parentId: string | undefined) => parentId ? detailPercRowsMap[`${parentId}_percGross`] : undefined;

  const impGroup = Object.values(groups).find(g => g.label.includes('2.01 + Importação'));
  const fin6Group = Object.values(groups).find(g => g.label.includes('2.06 + Financeiras'));
  const fin2Group = Object.values(groups).find(g => g.label.includes('2.02 + Tributárias'));
  const otherGroup = Object.values(groups).find(g => g.label.includes('2.10 + Desconsiderados'));
  const opGroup = Object.values(groups).find(g => g.label.includes('2.07 + Operacionais'));

  const mainGroups = Object.values(groups).filter(g =>
    ![impGroup?.id, opGroup?.id, fin6Group?.id, fin2Group?.id, otherGroup?.id].includes(g.id)
  );
  const subExpenses = expenseLines.filter(e => e.id.startsWith('sub_'));

  let finalPnlRows: (PnLNode | undefined)[] = [
    nodes['1'],
    nodes['1_volumes'],
    nodes['2'],
    nodes['2_volumes'],
    taxRootNode,
    ...(taxRootNode ? [getDetailPerc(taxRootNode.id)] : []),
    ...taxChildren,
    stRootNode,
    ...stChildren,
    nodes['5'],
    ...(nodes['5'] ? [getDetailPerc(nodes['5'].id)] : []),
    nodes['6'], margem,
    nodes['7'], ...(nodes['7'] ? [getDetailPerc('7')] : []),
    nodes['8'], ...(nodes['8'] ? [getDetailPerc('8')] : []),
    nodes['9'], ...(nodes['9'] ? [getDetailPerc('9')] : []),
    nodes['10'], ...(nodes['10'] ? [getDetailPerc('10')] : []),
    opIncome, margemOpIncome,
    ...(opGroup ? [opGroup, getDetailPerc(opGroup.id)] : []),
    lucroBruto, margemLucroBruto,
    ...(impGroup ? [impGroup, getDetailPerc(impGroup.id)] : []),
    ...mainGroups.flatMap(group => {
        const items: (PnLNode | undefined)[] = [group];
        const detailNode = getDetailPerc(group.id);
        if (detailNode) items.push(detailNode);
        return items;
    }),
    ebitda, margemEbitda,
    ...(fin6Group ? [fin6Group, getDetailPerc(fin6Group.id), financialRevenueNode] : []),
    ...(fin2Group ? [fin2Group] : []),
    impostosRoot,
    ...nodesTaxes,
    netProfit, margemNetProfit,
    ...(otherGroup ? [otherGroup] : []),
    ...subExpenses
  ];

  // --- Add Financial Revenue and subtract Taxes from Lucro Líquido ---
  months.forEach(m => {
    // Add Financial Revenue to Net Profit
    if (netProfit) netProfit.values[m] += totFR[m];
    // Subtract Tax "Considerar" values from Net Profit
    if (netProfit) netProfit.values[m] -= impostosRoot.values[m];
    // Re-compute Net Profit margin now that Net Profit is final
    const liquida = nodes['6'].values[m];
    margemNetProfit.values[m] = liquida ? (netProfit.values[m] / liquida) * 100 : 0;
  });

  // Return the rows in the explicitly defined order
  return finalPnlRows.filter(Boolean) as PnLNode[];
}

/**
 * Merge extra tax rows into a tax subtree and update root total for January 2025.
 */
function mergeTaxExtras(nodes: PnLNode[], extras: ExtraTaxRow[]) {
  const root = nodes.find(n => !n.parentId)!;
  const monthKey = '2025-01' as Month;
  for (const x of extras) {
    let child = nodes.find(n => n.id === x.id);
    if (!child) {
      child = { id: x.id, parentId: root.id, label: x.label, sign: x.sign, values: emptyYear(2025) };
      nodes.push(child);
    }
    child.values[monthKey] += x.valor;
    root.values[monthKey] += x.valor;
  }
} 