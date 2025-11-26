import { getMysqlPool } from './db'
import { Month, emptyYear } from './pnlLogic'
import type { RowDataPacket } from 'mysql2/promise'

export type RawDespesa = {
  Periodo: string          // "YYYY-MM"
  codigo_e_descricao: string
  categoria_descricao: string
  valor_documento: number
}

const SQL = `
SELECT
    CONCAT(SUBSTRING_INDEX(cp.codigo_categoria, '.', 2), ' + ', mc.descricao) as codigo_e_descricao,
    cat.descricao as categoria_descricao,
    SUM(cp.valor_documento) as valor_documento,
    DATE_FORMAT(STR_TO_DATE(cp.data_entrada, '%Y-%m-%d'), '%Y-%m') as Periodo
FROM omie_contas_pagar_api cp
LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo AND cp.nome_projeto = cat.nome_projeto
LEFT JOIN (
    SELECT DISTINCT nome_projeto, codigo, descricao
    FROM omie_categorias_api
    WHERE conta_despesa = 'S'
      AND LOCATE('.', codigo) = 2
      AND LENGTH(codigo) = 4
) mc ON SUBSTRING_INDEX(cp.codigo_categoria, '.', 2) = mc.codigo AND cp.nome_projeto = mc.nome_projeto
WHERE YEAR(STR_TO_DATE(cp.data_entrada, '%Y-%m-%d')) = ?
  AND cp.status_titulo != 'CANCELADO'
  AND NOT (mc.descricao = 'Operacionais' AND cat.descricao = 'Devolução') 
GROUP BY Periodo, codigo_e_descricao, categoria_descricao;` // Manually remove Devolucao from despesas as requested

export async function fetchDespesas(year: number): Promise<RawDespesa[]> {
  const pool = await getMysqlPool()
  const [rows] = await pool.query<RowDataPacket[]>(SQL, [year])
  return rows as RawDespesa[]
}

// New helper to fetch only CSLL and IRPJ expenses
export async function fetchTaxExpenses(year: number): Promise<RawDespesa[]> {
  const TAX_SQL = `
SELECT
    CONCAT(SUBSTRING_INDEX(cp.codigo_categoria, '.', 2), ' + ', mc.descricao) as codigo_e_descricao,
    cat.descricao as categoria_descricao,
    SUM(cp.valor_documento) as valor_documento,
    DATE_FORMAT(STR_TO_DATE(cp.data_entrada, '%Y-%m-%d'), '%Y-%m') as Periodo
FROM omie_contas_pagar_api cp
LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo AND cp.nome_projeto = cat.nome_projeto
LEFT JOIN (
    SELECT DISTINCT nome_projeto, codigo, descricao
    FROM omie_categorias_api
    WHERE conta_despesa = 'S'
      AND LOCATE('.', codigo) = 2
      AND LENGTH(codigo) = 4
) mc ON SUBSTRING_INDEX(cp.codigo_categoria, '.', 2) = mc.codigo AND cp.nome_projeto = mc.nome_projeto
WHERE YEAR(STR_TO_DATE(cp.data_entrada, '%Y-%m-%d')) = ?
  AND cp.status_titulo != 'CANCELADO'
  AND (cat.descricao LIKE 'IRPJ%' OR cat.descricao LIKE 'CSLL%')
GROUP BY Periodo, codigo_e_descricao, categoria_descricao;`;

  const pool = await getMysqlPool()
  const [rows] = await pool.query<RowDataPacket[]>(TAX_SQL, [year])
  return rows as RawDespesa[]
} 