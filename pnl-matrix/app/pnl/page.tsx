'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import DespesaDetailsModal from '@/components/DespesaDetailsModal';
import PnLTable, { PnLTableHandle } from '@/components/PnLTable';
import YearSelect from './YearSelect';
import NfeDetailsModal from '@/components/NfeDetailsModal';
import TaxDetailsModal from '@/components/TaxDetailsModal';
import FinancialRevenueDetailsModal from '@/components/FinancialRevenueDetailsModal';
import { exportToExcel } from '@/lib/exportToExcel';

export const dynamic = 'force-dynamic';

export default function PnlPage({ searchParams: initialSearchParams }: { searchParams: { year?: string } }) {
  const clientSearchParams = useSearchParams();

  const getYear = () => {
    const yearFromClient = clientSearchParams.get('year');
    if (yearFromClient) return Number(yearFromClient);
    if (initialSearchParams.year) return Number(initialSearchParams.year);
    return new Date().getFullYear();
  };
  const currentYear = getYear();

  const [data, setData] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalParams, setModalParams] = useState<null | { ym: string; code: string; cat: string }>(null);
  const [nfeOpen, setNfeOpen] = useState(false);
  const [nfeParams, setNfeParams] = useState<null | { ym: string; kind: 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas' | 'CPV_Devol' }>(null);
  const [taxOpen, setTaxOpen] = useState(false);
  const [taxParams, setTaxParams] = useState<null | { ym: string; taxName: string; scenario: 'Venda' | 'Bonificacao' | 'Devolucao' }>(null);
  const [frModalOpen, setFrModalOpen] = useState(false);
  const [frModalParams, setFrModalParams] = useState<null | { year: number; month: string; catSup: string; catDesc: string }>(null);
  const [isExporting, setIsExporting] = useState(false);
  const tableRef = useRef<PnLTableHandle>(null);

    useEffect(() => {
      const ctrl = new AbortController();

      (async () => {
        try {

          const res = await fetch(`/api/pnl?year=${currentYear}`, {
            signal: ctrl.signal,
            cache: "no-store",
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const json = await res.json();

          const rows = json?.data ?? json ?? [];

          setData(rows);
        } catch (e: any) {
          if (e?.name === "AbortError") return; // normal no dev
          setData([]); // opcional
        }
      })();

      return () => {
        ctrl.abort();
      };
    }, [currentYear]);

  const openDetailsModal = (ctx: {
    ym?: string;
    rowId?: string;
    kind?: string;
    taxName?: string;
    scenario?: string;
    year?: number;
    month?: string;
    catSup?: string;
    catDesc?: string;
  }) => {
    if (ctx.kind === 'tax' && ctx.taxName && ctx.scenario && ctx.ym) {
      setTaxParams({ ym: ctx.ym, taxName: ctx.taxName, scenario: ctx.scenario as 'Venda' | 'Bonificacao' | 'Devolucao' });
      setTaxOpen(true);
      return;
    }
    if (ctx.kind === 'fr_detail_modal' && ctx.year && ctx.month && ctx.catSup && ctx.catDesc) {
      setFrModalParams({ year: ctx.year, month: ctx.month, catSup: ctx.catSup, catDesc: ctx.catDesc });
      setFrModalOpen(true);
      return;
    }
    if (ctx.rowId && ('12578910'.includes(ctx.rowId) || ['1', '2', '5', '7', '8', '9', '10'].includes(ctx.rowId) ) && ctx.ym ) {
      const map: any = { '1': 'ReceitaBruta', '2': 'Devolucao', '5': 'Desconto', '7': 'CPV', '8': 'CPV_Boni', '9': 'Perdas', '10': 'CPV_Devol' };
      setNfeParams({ ym: ctx.ym, kind: ctx.kind || map[ctx.rowId] });
      setNfeOpen(true);
      return;
    }
    if (ctx.rowId && ctx.ym) {
      const node = data.find(d => d.id === ctx.rowId);
    if (!node) return;
    const parent = data.find(d => d.id === node.parentId);
    if (!parent) return;
      setModalParams({ ym: ctx.ym, code: parent.label, cat: node.label });
    setModalOpen(true);
    }
  };

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">P&amp;L – {currentYear}</h1>
        <button
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          disabled={isExporting}
          onClick={async () => {
            setIsExporting(true);
            try {
              const matrix = tableRef.current?.buildExportMatrix();
              if (matrix) await exportToExcel(matrix);
            } finally {
              setIsExporting(false);
            }
          }}
        >
          {isExporting ? 'Exportando…' : 'Download Excel'}
        </button>
      </div>
      <YearSelect />
      <PnLTable ref={tableRef} data={data} year={currentYear} onCellClick={openDetailsModal} />
      <DespesaDetailsModal
        open={modalOpen}
        params={modalParams}
        onClose={() => setModalOpen(false)}
      />
      <NfeDetailsModal
        open={nfeOpen}
        params={nfeParams}
        onClose={() => setNfeOpen(false)}
      />
      <TaxDetailsModal
        open={taxOpen}
        params={taxParams}
        onClose={() => setTaxOpen(false)}
      />
      <FinancialRevenueDetailsModal
        open={frModalOpen}
        params={frModalParams}
        onClose={() => setFrModalOpen(false)}
      />
    </main>
  );
} 