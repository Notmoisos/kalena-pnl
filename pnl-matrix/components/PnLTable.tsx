'use client';
import {
  ColumnDef,
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  ExpandedState
} from '@tanstack/react-table';
import { useMemo, useState, useImperativeHandle, forwardRef } from 'react';
import type { PnLNode, Month } from '@/lib/pnlLogic';
import clsx from 'clsx';
import * as React from 'react';
import { FamilyApiRow } from '@/lib/nfeFamily';
import type { ProductApiRow } from '@/lib/nfeProduct';
import { fmtPlainBR as fmt } from '@/lib/format';

// helper so we can render % rows
const renderVal = (row: any, m: Month) => {
  const v = row.original.values[m] || 0;
  if (row.original.kind === 'percentage' || row.original.kind === 'detailPercentage') {
    return Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v / 100);
  }
  return fmt(v);
};

// Extend PnLNode but override its kind to include 'breakdown', 'volume_parent', 'group', and 'financial_revenue_subgroup'
type Node = Omit<PnLNode, 'kind' | 'meta'> & {
  kind?: 'breakdown' | 'intermediate' | 'percentage' | 'family' | 'loading' | 'detailPercentage' | 'volume_parent' | 'group' | 'financial_revenue_subgroup';
  meta?: any;
};

type PnLTableHandle = {
  buildExportMatrix: () => any[][];
};

const safeDivision = (a: number, b: number) => (b ? a / b : 0);

function triggerCpvDoubleFetch(
  cacheKey: string,
  year: number,
  months: Month[],
  setLoadingCpvFamilyPercent: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  setCpvFamilyPercentData: React.Dispatch<React.SetStateAction<Record<string, Node[]>>>,
  setDataVersion: React.Dispatch<React.SetStateAction<number>>
) {
  setLoadingCpvFamilyPercent(m => ({ ...m, [cacheKey]: true }));
  (async () => {
    const [cogsGroupedByFamily, receitaGroupedByFamily]: [FamilyApiRow[], FamilyApiRow[]] = await Promise.all([
      fetch(`/api/cogs-details?year=${year}&kind=CPV&breakdown=family`).then(r => r.json()),
      fetch(`/api/nfe-details?year=${year}&kind=ReceitaBruta&breakdown=family`).then(r => r.json()),
    ]);

    const cogsAggregatedMap = new Map<string, Node>();
    // This map will store the original monthly values for percentage calculation
    const cogsMonthlyOriginalValues = new Map<string, Record<Month, number>>();

    for (const r of cogsGroupedByFamily) {
      if (!r.familia) continue;
      const familiaLabel = r.familia;
      const ym = r.ym as Month;
      const valor = r.valor;

      // Aggregate values for the main display node (summing up all months for that familia)
      let aggNode = cogsAggregatedMap.get(familiaLabel);
      if (!aggNode) {
        aggNode = {
          id: `7_fam_${familiaLabel.replace(/\W+/g, '_')}`,
          parentId: '7',
          label: familiaLabel,
          kind: 'family',
          values: Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>
        };
        cogsAggregatedMap.set(familiaLabel, aggNode);
      }
      // For the main display node, we sum up values if an API returns multiple entries for the same YM for the same familia
      // or if we were to decide to sum all YM into one display value (but current table structure is per-month).
      // For now, we assume the API provides one value per familia per YM.
      aggNode.values[ym] = valor; // Assigning directly as API should give one value per familia/ym

      // Store original monthly values for this familia
      let monthlyOriginals = cogsMonthlyOriginalValues.get(familiaLabel);
      if (!monthlyOriginals) {
        monthlyOriginals = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
        cogsMonthlyOriginalValues.set(familiaLabel, monthlyOriginals);
      }
      monthlyOriginals[ym] = valor; // Assigning directly
    }

    const receitaMonthlyMap = new Map<string, Record<Month, number>>();
    for (const r of receitaGroupedByFamily) {
      if (!r.familia) continue;
      const familiaLabel = r.familia;
      const ym = r.ym as Month;
      const valor = r.valor;

      let monthlyReceitas = receitaMonthlyMap.get(familiaLabel);
      if (!monthlyReceitas) {
        monthlyReceitas = Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>;
        receitaMonthlyMap.set(familiaLabel, monthlyReceitas);
      }
      monthlyReceitas[ym] = valor; // Assigning directly
    }

    const resultNodes: Node[] = [];
    const sortedAggregatedCogs = Array.from(cogsAggregatedMap.values()).sort((a,b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));

    for (const famNode of sortedAggregatedCogs) {
      resultNodes.push(famNode);

      const originalCogsForFamilia = cogsMonthlyOriginalValues.get(famNode.label) || Object.fromEntries(months.map(m => [m, 0]));
      const receitaForFamilia = receitaMonthlyMap.get(famNode.label) || Object.fromEntries(months.map(m => [m, 0]));

      const percentValues = Object.fromEntries(
        months.map(m => {
          const cogsValForMonth = originalCogsForFamilia[m] || 0;
          const receitaValForMonth = receitaForFamilia[m] || 0;
          return [m, safeDivision(cogsValForMonth, receitaValForMonth) * 100];
        })
      ) as Record<Month, number>;

      resultNodes.push({
        id: `${famNode.id}_percGross`,
        parentId: famNode.parentId,
        label: '',
        kind: 'detailPercentage',
        values: percentValues
      });
    }
    
    setCpvFamilyPercentData(m => ({ ...m, [cacheKey]: resultNodes }));
    setLoadingCpvFamilyPercent(m => ({ ...m, [cacheKey]: false }));
    setDataVersion(v => v + 1);
  })();
}

const PnLTable = forwardRef<PnLTableHandle, {
  data: PnLNode[];
  year: number;
  onCellClick: (ctx: any) => void;
}>(({ data, year, onCellClick }, ref) => {
  const months: Month[] = useMemo(() =>
    Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}` as Month
    ),
  [year, onCellClick])

  const childMap = useMemo(() => {
    const map: Record<string, Node[]> = {}
    data.forEach((d) => {
      if (d.parentId) (map[d.parentId] ||= []).push(d as Node)
    })
    return map
  }, [data])

  const [familyData, setFamilyData] = useState<Record<string, Node[]>>({})
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [productData, setProductData] = useState<Record<string, Node[]>>({})
  const [loadingProdMap, setLoadingProdMap] = useState<Record<string, boolean>>({})
  const [dataVersion, setDataVersion] = useState(0)
  const [cpvFamilyPercentData, setCpvFamilyPercentData] = useState<Record<string, Node[]>>({});
  const [loadingCpvFamilyPercent, setLoadingCpvFamilyPercent] = useState<Record<string, boolean>>({});

  // Only pass root nodes (no parentId) to the table
  const rootRows = useMemo(() => data.filter((n) => !n.parentId), [data, dataVersion])

  function pivotFamilies (api: FamilyApiRow[], parentId: string, months: Month[]): Node[] {
    const byFam = new Map<string, Node>()
    for (const r of api) {
      if (r.familia == null) continue;
      const id = `${parentId}_fam_${r.familia.replace(/\W+/g, '_')}`
      const node = byFam.get(r.familia) ?? {
        id, parentId,
        label: r.familia,
        kind: 'family',
        values: Object.fromEntries(months.map(m => [m, 0])) as Record<Month, number>
      }
      node.values[r.ym as Month] += r.valor
      byFam.set(r.familia, node)
    }
    // Convert to array and sort A→Z by family label
    const nodes = Array.from(byFam.values())
    nodes.sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })
    )
    return nodes
  }

  function pivotProducts(api: ProductApiRow[], parentId: string, months: Month[]): Node[] {
    const byProd = new Map<string, Node>()
    for (const r of api) {
      if (r.produto == null) continue;
      const id = `${parentId}_prod_${r.produto.replace(/\W+/g,'_')}`
      const node = byProd.get(r.produto) ?? {
        id, parentId,
        label: r.produto,
        kind: 'family',
        values: Object.fromEntries(months.map(m=>[m,0])) as Record<Month,number>
      }
      node.values[r.ym as Month] += r.valor
      byProd.set(r.produto, node)
    }
    const nodes = Array.from(byProd.values());
    nodes.sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })
    );
    return nodes;
  }

  const monthNames: Record<string, string> = {
    '01': 'Janeiro',
    '02': 'Fevereiro',
    '03': 'Março',
    '04': 'Abril',
    '05': 'Maio',
    '06': 'Junho',
    '07': 'Julho',
    '08': 'Agosto',
    '09': 'Setembro',
    '10': 'Outubro',
    '11': 'Novembro',
    '12': 'Dezembro',
  };

  const cols = React.useMemo<ColumnDef<Node>[]>(() => {
    const monthCols: ColumnDef<Node, any>[] = months.map((m) => ({
      id: m,
      header: monthNames[m.slice(5)],
      cell: ({ row }: { row: any }) => {
        if (row.original.id === '1_volumes' || row.original.id === '2_volumes') {
          return <span />;
        }
        const kind = row.original.kind;
        if (kind === 'breakdown') {
          return <span />;
        }
        const v = row.original.values[m] || 0;
        const isFRSubGroup = kind === 'financial_revenue_subgroup';
        const isFRLeaf = row.original.parentId?.startsWith('financial_revenue_') && kind === 'family';
        if (isFRSubGroup || isFRLeaf) {
          const displayValue = fmt(v);
          if (isFRLeaf) {
            return (
              <button
                className="text-right w-full hover:underline font-bold"
                onClick={() => {
                  if (onCellClick && row.original.meta) {
                    const [_year, monthStr] = m.split('-');
                    onCellClick({
                      kind: 'fr_detail_modal',
                      year: parseInt(_year),
                      month: monthStr,
                      catSup: row.original.meta.sup,
                      catDesc: row.original.meta.cat,
                    });
                  }
                }}
              >
                {displayValue}
              </button>
            );
          } else {
            return <span className="text-right w-full font-bold">{displayValue}</span>;
          }
        }
        if (['1_volumes','2_volumes'].includes(row.original.parentId ?? '') && kind === 'family') {
          const text = Number.isInteger(v) ? `${v}` : v.toFixed(2);
          return <span className="text-right w-full">{text}</span>;
        }
        const isDetailPercentage = kind === 'detailPercentage';
        const isBold = kind === 'family' || kind === 'intermediate' || (kind !== 'percentage' && kind !== 'loading' && !isDetailPercentage);
        const isIntermediate = kind === 'intermediate' || kind === 'percentage';
        const isFamilyRow = kind === 'family';
        const isClickableLeaf = !row.getCanExpand() && !isIntermediate && !isFamilyRow && !isDetailPercentage;
        // disable clicks for tax expense children (CSLL/IRPJ)
        const isTaxExpenseChild = /^(csll|irpj)_/.test(row.original.id);
        const isClickableLeafAdjusted = isClickableLeaf && !isTaxExpenseChild;

        // Revenue/COGS mapping (for NFe details)
        const revMap: Record<string, string> = {
          // '1': 'ReceitaBruta', // removed for drilldown
          '2': 'Devolucao',
          '5': 'Desconto',
          '7': 'CPV',
          '8': 'CPV_Boni',
          '9': 'Perdas',
          '10': 'CPV_Devol',
        };

        // Check if the row ID indicates a Tax row
        const isTaxChild = /^tax(3|4)_/.test(row.original.id) || row.original.id === 'taxIPI';

        const value = kind === 'loading' ? '–' : renderVal(row, m);

        if (isClickableLeafAdjusted) {
          return (
            <button
              className={clsx(
                "text-right w-full hover:underline",
                { 'font-bold': isBold },
                { 'italic': isDetailPercentage }
              )}
              onClick={async () => {
                row.toggleExpanded();
                const cacheKey = `${row.original.id}_${year}`;
                const isBreakFamilia = row.original.id.endsWith('_breakdown_familia');
                if (isBreakFamilia && !familyData[cacheKey] && !loadingMap[cacheKey]) {
                  setLoadingMap(p => ({ ...p, [cacheKey]: true }));
                  try {
                    const parent = String(row.original.parentId!);
                    let endpoint = '/api/cogs-details';
                    let apiKind: string = '';
                    if (['7','8','9','10'].includes(parent)) {
                      apiKind = { '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' }[parent] ?? '';
                    } else if (['1','2','5'].includes(parent)) {
                      endpoint = '/api/nfe-details';
                      apiKind = { '1':'ReceitaBruta','2':'Devolucao','5':'Desconto' }[parent] ?? '';
                    }
                    const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=family`);
                    const rows = await res.json() as FamilyApiRow[];
                    setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }));
                    setDataVersion(v => v + 1);
                  } finally {
                    setLoadingMap(p => ({ ...p, [cacheKey]: false }));
                  }
                  return;
                }
                const isBreakProduto = row.original.id.endsWith('_breakdown_produto');
                if (isBreakProduto && !productData[cacheKey] && !loadingProdMap[cacheKey]) {
                  setLoadingProdMap(p => ({ ...p, [cacheKey]: true }));
                  try {
                    const parent = String(row.original.parentId!);
                    let endpoint = '/api/cogs-details';
                    let apiKind: string = '';
                    if (['7','8','9','10'].includes(parent)) {
                      apiKind = { '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' }[parent] ?? '';
                    } else if (['1','2','5'].includes(parent)) {
                      endpoint = '/api/nfe-details';
                      apiKind = { '1':'ReceitaBruta','2':'Devolucao','5':'Desconto' }[parent] ?? '';
                    }
                    const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=product`);
                    const rows = await res.json() as ProductApiRow[];
                    setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }));
                    setDataVersion(v => v + 1);
                  } finally {
                    setLoadingProdMap(p => ({ ...p, [cacheKey]: false }));
                  }
                  return;
                }
                if (revMap[row.original.id]) {
                  onCellClick({ ym: m, rowId: row.original.id, kind: revMap[row.original.id] });
                } else if (isTaxChild) {
                  let taxName: string | undefined;
                  let scenarioKey: 'Venda' | 'Bonificacao' | 'Devolucao' | undefined;
                  if (row.original.id === 'taxIPI') {
                    taxName = 'IPI';
                    scenarioKey = 'Venda';
                  } else {
                    const match = row.original.id.match(/^tax[34]_(.+)_(Venda|Bonificacao|Devolucao)$/);
                    if (match) {
                      taxName = match[1];
                      scenarioKey = match[2] as 'Venda' | 'Bonificacao' | 'Devolucao';
                    }
                  }
                  if (taxName && scenarioKey) {
                    onCellClick({ ym: m, rowId: row.original.id, kind: 'tax', taxName, scenario: scenarioKey });
                  }
                } else {
                  onCellClick({ ym: m, rowId: row.original.id });
                }
              }}
            >
              {value}
            </button>
          );
        }
        return (
          <span className={clsx({ 'font-bold': isBold }, { 'italic': isDetailPercentage })}>
            {value}
          </span>
        );
      },
      meta: { numeric: true } as { numeric: boolean }
    }));

    return [
      {
        id: 'expander',
        header: '',
        cell: ({ row }: { row: any }) => {
          const cacheKey = `${row.original.id}_${year}`;
          return row.getCanExpand() ? (
            <button
              onClick={async () => {
                row.toggleExpanded();
                const id = row.original.id;
                // Special: CPV > Familia triggers double-fetch
                if (id === '7_breakdown_familia' && !cpvFamilyPercentData[cacheKey] && !loadingCpvFamilyPercent[cacheKey]) {
                  triggerCpvDoubleFetch(cacheKey, year, months, setLoadingCpvFamilyPercent, setCpvFamilyPercentData, setDataVersion);
                  return;
                }
                // Other COGS groups: fallback to old fetch
                if (id.endsWith('_breakdown_familia') && ['8','9','10'].includes(row.original.parentId ?? '') && !familyData[cacheKey] && !loadingMap[cacheKey]) {
                  setLoadingMap(p => ({ ...p, [cacheKey]: true }));
                  const parent = row.original.parentId!;
                  let apiKind = '';
                  if (parent === '8' || parent === '9' || parent === '10') {
                    const parentKey = parent as '8' | '9' | '10';
                    apiKind = { '8': 'CPV_Boni', '9': 'Perdas', '10': 'CPV_Devol' }[parentKey];
                  }
                  const res = await fetch(`/api/cogs-details?year=${year}&kind=${apiKind}&breakdown=family`);
                  const rows = await res.json();
                  setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }));
                  setDataVersion(v => v + 1);
                  setLoadingMap(p => ({ ...p, [cacheKey]: false }));
                  return;
                }
                // 1) Top‐level: no fetch for volume parents
                if (['1','1_volumes','2','2_volumes','5','7','8','9','10'].includes(id)) return;
                // Volume Familia breakdown (when clicking the expander of the "Familia" intermediate row)
                if (id.endsWith('_breakdown_familia') && id.includes('_volumes') && !familyData[cacheKey] && !loadingMap[cacheKey]) {
                  const parent = id.replace('_breakdown_familia','');
                  const kind = parent.startsWith('1_') ? 'ReceitaBruta' : 'Devolucao';
                  setLoadingMap(p => ({ ...p, [cacheKey]: true }));
                  try {
                    const rows = await fetch(`/api/volume-details?year=${year}&kind=${kind}&breakdown=family`).then(r=>r.json()) as FamilyApiRow[];
                    setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }));
                    setDataVersion(v => v + 1);
                  } finally { setLoadingMap(p => ({ ...p, [cacheKey]: false })); }
                  return;
                }
                // Volume Produto breakdown (when clicking the expander of the "Produto" intermediate row)
                if (id.endsWith('_breakdown_produto') && id.includes('_volumes') && !productData[cacheKey] && !loadingProdMap[cacheKey]) {
                  const parent = id.replace('_breakdown_produto','');
                  const kind = parent.startsWith('1_') ? 'ReceitaBruta' : 'Devolucao';
                  setLoadingProdMap(p => ({ ...p, [cacheKey]: true }));
                  try {
                    const rows = await fetch(`/api/volume-details?year=${year}&kind=${kind}&breakdown=product`).then(r=>r.json()) as ProductApiRow[];
                    setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }));
                    setDataVersion(v => v + 1);
                  } finally { setLoadingProdMap(p => ({ ...p, [cacheKey]: false })); }
                  return;
                }
                // ===== Restore original generic Familia breakdown =====
                if (id.endsWith('_breakdown_familia') && !id.includes('_volumes') && !familyData[cacheKey] && !loadingMap[cacheKey]) {
                  const parent = id.replace('_breakdown_familia','');
                  let endpoint = '/api/cogs-details';
                  let apiKind = ({ '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' } as Record<string,string>)[parent] || '';
                  if (['1','2','5'].includes(parent)) {
                    endpoint = '/api/nfe-details';
                    apiKind = ({ '1':'ReceitaBruta','2':'Devolucao','5':'Desconto' } as Record<string,string>)[parent] || '';
                  }
                  setLoadingMap(p => ({ ...p, [cacheKey]: true }));
                  try {
                    const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=family`);
                    const rows = await res.json() as FamilyApiRow[];
                    setFamilyData(p => ({ ...p, [cacheKey]: pivotFamilies(rows, parent, months) }));
                    setDataVersion(v => v + 1);
                  } finally { setLoadingMap(p => ({ ...p, [cacheKey]: false })); }
                  return;
                }
                // ===== Restore original generic Produto breakdown =====
                if (id.endsWith('_breakdown_produto') && !id.includes('_volumes') && !productData[cacheKey] && !loadingProdMap[cacheKey]) {
                  const parent = id.replace('_breakdown_produto','');
                  let endpoint = '/api/cogs-details';
                  let apiKind = ({ '7':'CPV','8':'CPV_Boni','9':'Perdas','10':'CPV_Devol' } as Record<string,string>)[parent] || '';
                  if (['1','2','5'].includes(parent)) {
                    endpoint = '/api/nfe-details';
                    apiKind = ({ '1':'ReceitaBruta','2':'Devolucao','5':'Desconto' } as Record<string,string>)[parent] || '';
                  }
                  setLoadingProdMap(p => ({ ...p, [cacheKey]: true }));
                  try {
                    const res = await fetch(`${endpoint}?year=${year}&kind=${apiKind}&breakdown=product`);
                    const rows = await res.json() as ProductApiRow[];
                    setProductData(p => ({ ...p, [cacheKey]: pivotProducts(rows, parent, months) }));
                    setDataVersion(v => v + 1);
                  } finally { setLoadingProdMap(p => ({ ...p, [cacheKey]: false })); }
                  return;
                }
              }}
              className="mr-1"
              aria-label={row.getIsExpanded() ? 'Recolher' : 'Expandir'}
              aria-expanded={row.getIsExpanded()}
            >
              {row.getIsExpanded() ? '▼' : '▶'}
            </button>
          ) : null;
        }
      },
      {
        accessorKey: 'label',
        header: 'Descrição',
        cell: ({ row, getValue }: { row: any; getValue: () => unknown }) => {
          const kind = row.original.kind;
          const isDetailPercentage = kind === 'detailPercentage';
          return (
            <span
              className={clsx(
                "whitespace-nowrap",
                { 'italic': isDetailPercentage }
              )}
              style={{ paddingLeft: row.depth * 16 }}
            >
              {isDetailPercentage ? '' : getValue() as string}
            </span>
          );
        }
      },
      ...monthCols
    ];
  }, [year, onCellClick, familyData, loadingMap, months]);

  const [expanded, setExpanded] = React.useState<ExpandedState>({
    tax3: false,   // revenue taxes collapsed by default
    tax4: false,   // ST taxes collapsed
    other: true,
  });

  const getSubRows = (n: Node) => {
    const cacheKey = `${n.id}_${year}`;

    // Financial Revenue: first level (sub-groups)
    if (n.id === 'financial_revenue' && n.meta?.frBySup) {
      return n.meta.frBySup.map((g: any) => ({
        id: `financial_revenue_${g.supLabel.replace(/\W+/g, '_')}`,
        parentId: n.id,
        label: g.supLabel,
        values: g.vals,
        kind: 'financial_revenue_subgroup',
        meta: { cats: g.cats }
      }) as Node);
    }
    // Financial Revenue: second level (categories)
    if (n.kind === 'financial_revenue_subgroup' && n.meta && Array.isArray(n.meta.cats)) {
      return n.meta.cats.map((c: any) => ({
        id: `${n.id}_cat_${c.catLabel.replace(/\W+/g, '_')}`,
        parentId: n.id,
        label: c.catLabel,
        values: c.vals,
        kind: 'family',
        meta: { sup: n.label, cat: c.catLabel }
      }) as Node);
    }

    // Create 'Familia' and 'Produto' intermediate breakdown rows for '1_volumes' and '2_volumes' parents.
    if (n.id === '1_volumes' || n.id === '2_volumes') {
      return [
        { id: `${n.id}_breakdown_familia`, parentId: n.id, label: 'Familia', kind: 'breakdown', values: {} as Record<Month,number> } as Node,
        { id: `${n.id}_breakdown_produto`, parentId: n.id, label: 'Produto', kind: 'breakdown', values: {} as Record<Month,number> } as Node
      ];
    }

    // 1) Top-level groups ('1', '2', '5', '7', '8', '9', '10') -> create 'Familia' and 'Produto' intermediate breakdown rows
    if (['1','2','5','7','8','9','10'].includes(n.id)) {
      return [
        { id:`${n.id}_breakdown_familia`, parentId:n.id, label:'Familia', kind:'breakdown', values:{} as Record<Month,number> } as Node,
        { id:`${n.id}_breakdown_produto`, parentId:n.id, label:'Produto', kind:'breakdown', values:{} as Record<Month,number> } as Node
      ];
    }

    // 2. Handle "_breakdown_familia" intermediate rows - THIS REPLACES THE OLD GENERIC BLOCK
    if (n.id.endsWith('_breakdown_familia')) {
      const parentId = n.parentId!; // Should always exist for these intermediate rows

      // 2.a CPV (parent '7') - Special async double fetch and percentage calculation
      if (parentId === '7') {
        if (loadingCpvFamilyPercent[cacheKey]) {
          return [{ id: `loading_${cacheKey}`, parentId: n.parentId, label: 'Carregando…', kind: 'loading', values: {} as Record<Month, number> } as Node];
        }
        if (cpvFamilyPercentData[cacheKey]) {
          return cpvFamilyPercentData[cacheKey]; // These are already [fam, pct, fam, pct...]
        }
        // If not loading and no data, trigger the fetch.
        // The onClick handler for the expander button for '7_breakdown_familia' already calls triggerCpvDoubleFetch.
        // So, we just show loading here if data isn't ready yet.
        return [{ id: `loading_${cacheKey}`, parentId: n.parentId, label: 'Carregando…', kind: 'loading', values: {} as Record<Month, number> } as Node];
      }

      // 2.b Other COGS groups (parents '8', '9', '10') - Fetch from familyData, NO percentage rows
      else if (['8', '9', '10'].includes(parentId)) {
        if (loadingMap[cacheKey]) { // Uses the generic loadingMap for these
          return [{ id: `loading_${cacheKey}`, parentId: n.parentId, label: 'Carregando…', kind: 'loading', values: {} as Record<Month, number> } as Node];
        }
        // Data is fetched by the expander's onClick and stored in familyData via pivotFamilies
        return familyData[cacheKey] ?? []; // These are just [fam, fam, fam...]
      }

      // 2.c Revenue/Returns/Discount (parents '1', '2', '5') - Fetch from familyData, NO percentage rows
      else if (['1', '2', '5'].includes(parentId)) {
        if (loadingMap[cacheKey]) {
          return [{ id: `loading_${cacheKey}`, parentId: n.parentId, label: 'Carregando…', kind: 'loading', values: {} as Record<Month, number> } as Node];
        }
        // Data is fetched by the expander's onClick and stored in familyData via pivotFamilies
        return familyData[cacheKey] ?? []; // These are just [fam, fam, fam...]
      }

      // 2.d Volume breakdown (parent ends with '_volumes') - NO percentage rows
      else if (parentId.endsWith('_volumes')) {
          if (loadingMap[cacheKey]) {
              return [{ id: `loading_${cacheKey}`, parentId: n.parentId, label: 'Carregando…', kind: 'loading', values: {} as Record<Month, number> } as Node];
          }
          // Data is fetched by the expander's onClick and stored in familyData via pivotFamilies
          return familyData[cacheKey] ?? [];
      }
    }

    // 3. Handle "_breakdown_produto" intermediate rows
    if (n.id.endsWith('_breakdown_produto')) {
      if (loadingProdMap[cacheKey]) {
        return [{ id:`loading_${cacheKey}`, parentId:n.parentId, label:'Carregando…', kind:'loading', values:{} as Record<Month,number> } as Node];
      }
      return productData[cacheKey] ?? [];
    }

    // Remove or comment out the old generic blocks for COGS groups (7,8,9) that interleaved percentages
    // and the "2.07 + Operacionais" block if it also added incorrect percentages.
    // The new specific logic in section 2 above handles these cases correctly.

    // Fallback to childMap for other pre-defined parent-child relationships
    return childMap[n.id] ?? [];
  };

  const table = useReactTable({
    data: rootRows,
    columns: cols,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowCanExpand: (r) =>
      ['1','1_volumes','2','2_volumes','5','7','8','9','10'].includes(r.original.id)
      || r.original.id.endsWith('_breakdown_familia')
      || r.original.id.endsWith('_breakdown_produto')
      || r.original.id === 'financial_revenue'
      || r.original.id === 'taxes'
      || (r.original.kind === 'financial_revenue_subgroup' && r.original.meta?.cats?.length > 0)
      || (childMap[r.original.id]?.length ?? 0) > 0,
    getSubRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel()
  });

  React.useImperativeHandle(ref, () => ({
    buildExportMatrix: () => {
      // Get visible columns (skip expander)
      const visibleCols = table.getVisibleLeafColumns().filter(c => c.id !== 'expander');
      const headers = visibleCols.map(c => c.columnDef.header as string);
      const body = table.getRowModel().rows.map(row => {
        return visibleCols.map(col => {
          if (col.id === 'label') {
            return ' '.repeat(row.depth * 2) + row.original.label;
          }
          // Fix: allow any index for values
          // @ts-ignore
          const val = row.original.values ? row.original.values[col.id] : undefined;
          if (row.original.kind?.includes('percentage') || row.original.kind === 'detailPercentage') {
            return { v: (val ?? 0) / 100, t: 'n', z: '0.0%' };
          }
          if (typeof val === 'number') {
            return { v: Math.round(val), t: 'n' };
          }
          return { v: val ?? '', t: 's' };
        });
      });
      return [headers, ...body] as any[][];
    }
  }));

  return (
    <div className="border rounded">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 sticky top-0 z-20">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className={clsx(
                    'px-2 py-1 sticky top-0 z-20 bg-gray-100',
                    (h.column.columnDef.meta && (h.column.columnDef.meta as any).numeric) ? 'text-center' : 'text-left'
                  )}
                >
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={clsx(
                'border-b last:border-0',
                row.original.kind === 'breakdown' && 'bg-[#e3e6f1]',
                // green for family rows AND their %-of-gross siblings under CPV including Devolucoes
                (row.original.kind === 'family' ||
                  (row.original.kind === 'detailPercentage' && ['7','8','9','10'].includes(row.original.parentId || '')))
                    && 'bg-emerald-100',
                row.original.kind === 'loading' && 'bg-gray-100 text-gray-500',
                (row.original.kind === 'intermediate' || row.original.kind === 'percentage') && 'bg-blue-900 text-white',
                // keep light-blue for other detailPercentages (e.g. under 2.07)
                row.original.kind === 'detailPercentage'
                  && !(['7','8','9'].includes(row.original.parentId || ''))
                  && row.depth > 0
                  && 'bg-[#e3e6f1]',
                // Do NOT apply bg-[#e3e6f1] for volume_parent rows
                row.original.kind === 'volume_parent' && '',
                !row.original.kind && row.depth > 0 && !['1_volumes','2_volumes'].includes(row.original.id) && 'bg-[#e3e6f1]',
                !row.original.kind && row.depth > 0 && ['1_volumes','2_volumes'].includes(row.original.id) && ''
              )}
            >
              {row.original.kind === 'loading' ? (
                <td colSpan={cols.length} className="px-2 py-1 text-center" style={{ paddingLeft: `${row.depth * 16 + 16}px` }}>
                  {row.original.label}
                </td>
              ) : (
                row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={clsx(
                      'px-2 py-1',
                      (cell.column.columnDef.meta && (cell.column.columnDef.meta as any).numeric) ? 'text-right' : undefined,
                      row.original.id === '1' && 'sticky top-6 z-10 bg-white'
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default PnLTable;
export type { PnLTableHandle }; 