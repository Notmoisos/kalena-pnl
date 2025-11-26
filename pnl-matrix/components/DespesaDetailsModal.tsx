"use client";
import { useEffect, useState } from 'react';
import React from 'react';
import { fmtPlainBR } from '@/lib/format';

export interface DespesaDetail {
  data_entrada: string;
  fornecedor_fantasia: string;
  observacao: string;
  status_titulo: string;
  valor_documento: number;
}

export default function DespesaDetailsModal({ open, params, onClose }: {
  open: boolean;
  params: { ym: string; code: string; cat: string } | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<DespesaDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!params) {
      setRows([]);
      setLoading(false);
      return;
    }
    setRows([]);
    setLoading(true);
    fetch(`/api/despesa-details?ym=${params.ym}&code=${encodeURIComponent(params.code)}&cat=${encodeURIComponent(params.cat)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          console.error('Error from /api/despesa-details:', data);
          setLoading(false);
          return [];
        }
        setLoading(false);
        return data;
      })
      .then(setRows)
      .catch((err) => {
        console.error('Fetch error in DespesaDetailsModal:', err);
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
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-auto max-w-3xl max-h-[80vh] flex flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2 border-b flex justify-between items-center rounded-t-lg">
          <h2 id="modal-title" className="text-lg font-semibold">
            {params?.code} – {params?.cat} – {params?.ym}
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
                <th className="text-left  px-2 py-1">Data</th>
                <th className="text-left  px-2 py-1">Fornecedor</th>
                <th className="text-left  px-2 py-1">Observação</th>
                <th className="text-left  px-2 py-1">Status</th>
                <th className="text-right px-2 py-1">Valor</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="text-center italic text-gray-500 py-4">Carregando detalhes...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center italic text-gray-500 py-4">Nenhum item encontrado para este período.</td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-1">{r.data_entrada}</td>
                  <td className="px-2 py-1">{r.fornecedor_fantasia}</td>
                  <td className="px-2 py-1">{r.observacao}</td>
                  <td className="px-2 py-1">{r.status_titulo}</td>
                  <td className="px-2 py-1 text-right">{fmtPlainBR(r.valor_documento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 