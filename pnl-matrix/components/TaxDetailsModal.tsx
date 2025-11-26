"use client";
import { useEffect, useState } from 'react';
import { TaxDetail } from '@/lib/nfe';
import React from 'react';
import { fmtPlainBR } from '@/lib/format';

export default function TaxDetailsModal({ open, params, onClose }: {
  open: boolean;
  params: null | { ym: string; taxName: string; scenario: 'Venda' | 'Bonificacao' | 'Devolucao' };
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TaxDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!params) return;
    setRows([]);
    setLoading(true);
    fetch(`/api/tax-details?ym=${params.ym}&taxName=${params.taxName}&scenario=${params.scenario}`)
      .then(async (res) => {
        const data = await res.json();
        setLoading(false);
        return Array.isArray(data) ? data : [];
      })
      .then(setRows)
      .catch((err) => {
        console.error('Fetch error in TaxDetailsModal:', err);
        setRows([]);
        setLoading(false);
      });
  }, [open, params]);

  if (!open) return null;

  const handleClose = () => {
    setRows([]);
    setLoading(false);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-auto max-w-3xl max-h-[80vh] flex flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2 border-b flex justify-between items-center rounded-t-lg">
          <h2 id="modal-title" className="text-lg font-semibold">
            {params?.taxName} – {params?.scenario} – {params?.ym}
          </h2>
          <button
            className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm"
            aria-label="Fechar detalhes"
            onClick={handleClose}
          >
            Fechar
          </button>
        </div>
        {/* Scrollable Table Content */}
        <div className="overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0 z-0">
              <tr>
                <th className="text-left px-2 py-1">Produto</th>
                <th className="text-right px-2 py-1">NF-es</th>
                <th className="text-right px-2 py-1">Valor</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3} className="text-center italic text-gray-500 py-4">
                    Carregando detalhes...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center italic text-gray-500 py-4">
                    Nenhum item encontrado para este período.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1">{r.produto}</td>
                  <td className="px-2 py-1 text-right">{r.n_nfes}</td>
                  <td className="px-2 py-1 text-right">{fmtPlainBR(r.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 