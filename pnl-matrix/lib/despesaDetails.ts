import { getMysqlPool } from './db';
import type { RowDataPacket } from 'mysql2/promise';

export interface DespesaDetail {
  data_entrada: string;          // YYYY-MM-DD
  fornecedor_fantasia: string;
  observacao: string;
  status_titulo: string;
  valor_documento: number;
}

export async function fetchDespesaDetails({
  ym,   // '2025-01'
  code, // '2.10 + Desconsiderados'
  cat,  // 'Contrato de câmbio'
}: { ym: string; code: string; cat: string }): Promise<DespesaDetail[]> {
  const pool = await getMysqlPool();

  const sql = `
    SELECT
      DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%Y-%m-%d'), '%Y-%m-%d') AS data_entrada,
      cl.nome_fantasia                                                   AS fornecedor_fantasia,
      cp.valor_documento                                                 AS valor_documento,
      cp.status_titulo,
      cp2.observacao
    FROM omie_contas_pagar_api cp
    LEFT JOIN omie_consulta_contas_pagar_api cp2 on cp2.codigo_lancamento_omie = cp.codigo_lancamento_omie
    LEFT JOIN omie_clientes_api cl ON cp.codigo_cliente_fornecedor = cl.codigo_cliente_omie
    LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo
      AND cp.nome_projeto = cat.nome_projeto
    WHERE DATE_FORMAT(STR_TO_DATE(cp.data_entrada,'%Y-%m-%d'), '%Y-%m') = ?
      AND CONCAT(SUBSTRING_INDEX(cp.codigo_categoria,'.',2), ' + ', ?) = ?
      AND cat.descricao = ?
      AND cp.status_titulo != 'CANCELADO'
    ORDER BY cp.valor_documento DESC`;

  const grpDesc = code.split(' + ')[1] ?? '';
  const [rows] = await pool.execute<RowDataPacket[]>(sql, [ym, grpDesc, code, cat]);
  return rows as unknown as DespesaDetail[];
} 