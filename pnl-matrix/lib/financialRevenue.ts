import { getMysqlPool } from './db';
import type { Month } from './pnlLogic';

export interface FinancialRevenueRow {
  // dev_id: string; // Not needed for aggregated view
  categoria_superior: string;
  categoria_descricao_superior: string;
  codigo_categoria: string;
  categoria_descricao: string;
  // data_lancamento_raw: string; // Not needed for aggregated view
  valor: number; // This will be the SUM
  // observacao: string | null; // Not needed for aggregated view
  ym: Month; // This will come from SQL
}

export async function getFinancialRevenueData(
  year: number
): Promise<FinancialRevenueRow[]> {
  const pool = await getMysqlPool();
  const sql = `
    SELECT
        cat.categoria_superior,
        cat2.descricao  AS categoria_descricao_superior,
        cat.codigo      AS codigo_categoria,
        cat.descricao   AS categoria_descricao,
        DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.dDtLanc')), '%d/%m/%Y'), '%Y-%m') AS ym,
        SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.nValorLanc')) AS DECIMAL(15,2))) AS valor
    FROM  omie_contas_correntes_lancamentos_api l
    JOIN  omie_categorias_api cat
          ON JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cCodCateg')) = cat.codigo
         AND l.nome_projeto = cat.nome_projeto
    JOIN  omie_categorias_api cat2
          ON cat.categoria_superior = cat2.codigo
         AND l.nome_projeto = cat2.nome_projeto
    WHERE cat.categoria_superior IN ('1.01','1.02')
      AND cat.codigo NOT IN ('1.01.99', '1.02.98')
      AND YEAR(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho,'$.dDtLanc')), '%d/%m/%Y')) = ?
    GROUP BY
        cat.categoria_superior,
        cat2.descricao,
        cat.codigo,
        cat.descricao,
        ym
    ORDER BY
        ym,
        cat.categoria_superior,
        cat.codigo;
  `;
  const [rows] = await pool.execute<any[]>(sql, [year]);
  return rows as FinancialRevenueRow[]; // No more client-side mapping for ym needed
} 