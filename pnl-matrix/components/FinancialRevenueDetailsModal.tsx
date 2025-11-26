'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import { fmtPlainBR } from '@/lib/format';

interface FinancialRevenueDetail {
  dev_id: string;
  data_lancamento_raw: string;
  valor: number;
  observacao: string | null;
}

export default function FinancialRevenueDetailsModal({
  open,
  params,
  onClose,
}: {
  open: boolean;
  params: { year: number; month: string; catSup: string; catDesc: string } | null;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<FinancialRevenueDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && params) {
      setLoading(true);
      fetch(
        `/api/financial-revenue-details?year=${params.year}&month=${params.month}&catSup=${encodeURIComponent(params.catSup)}&catDesc=${encodeURIComponent(params.catDesc)}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            console.error(data.error);
            setDetails([]);
          } else {
            setDetails(data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, params]);

  if (!open || !params) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full">
        <h2 className="text-xl font-bold mb-4">
          Detalhes: {params.catDesc} ({params.catSup}) - {params.month}/{params.year}
        </h2>
        {loading ? (
          <p>Carregando...</p>
        ) : details.length === 0 ? (
          <p>Nenhum detalhe encontrado.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-left">Observação</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d) => (
                  <tr key={d.dev_id} className="border-b">
                    <td className="p-2">{d.data_lancamento_raw}</td>
                    <td className="p-2 text-right">
                      {fmtPlainBR(d.valor)}
                    </td>
                    <td className="p-2">{d.observacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-6 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Fechar
        </button>
      </div>
    </div>
  );
} 