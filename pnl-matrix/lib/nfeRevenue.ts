import { BigQuery } from '@google-cloud/bigquery';
const bq = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, keyFilename: process.env.BQ_KEYFILE });
export type RevKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto';
export interface RevAgg { Periodo:string; kind:RevKind; valor:number; sign:'+'|'-'; }
export interface NfeDetail { produto:string; n_nfes:number; valor_total:number; }

export async function fetchRevenueAggregates(year:number):Promise<RevAgg[]> {
  const sql = `WITH base AS (
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period,'ReceitaBruta' AS kind,
           SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64) AS amount
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH),'Devolucao',
           SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE finalidade='Devolução' AND cancelada='Não'
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH),'Desconto',
           SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo') )
  SELECT FORMAT_DATE('%Y-%m', period) AS Periodo, kind, SUM(amount) AS valor,
         CASE kind WHEN 'Devolucao' THEN '-' WHEN 'Desconto' THEN '-' ELSE '+' END AS sign
  FROM base WHERE EXTRACT(YEAR FROM period)=@year GROUP BY Periodo, kind`;
  const [rows]=await bq.query({query:sql,params:{year}}); return rows as RevAgg[];
}

export async function fetchNfeDetails(ym:string, kind:RevKind):Promise<NfeDetail[]> {
  let filter: string;
  let valueColumn: string;
  let groupByColumn: string = 'parsed_x_prod_value';
  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
      valueColumn = 'SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)';
      break;
    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`;
      valueColumn = 'SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)';
      break;
    case 'Desconto':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo') AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`;
      valueColumn = 'parsed_desconto_proportional_value';
      break;
    default:
      console.error('Invalid kind received in fetchNfeDetails:', kind);
      return [];
  }
  const sql = `SELECT
    ${groupByColumn} AS produto,
    COUNT(*) AS n_nfes,
    SUM(SAFE_CAST(${valueColumn} AS FLOAT64)) AS valor_total
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter} AND FORMAT_DATE('%Y-%m', DATE(data_emissao)) = @ym
    GROUP BY produto
    ORDER BY valor_total DESC
    LIMIT 300`;
  const [rows] = await bq.query({ query: sql, params: { ym } });
  return rows as NfeDetail[];
}

// ————————————————————————————————————————————————
// New: sum of parsed_multa_juros_proportional_value by month
export interface JurosMultaAgg {
  Periodo: string;
  valor: number;
}

export async function fetchJurosMultaAggregates(year: number): Promise<JurosMultaAgg[]> {
  const sql = `
    SELECT
      FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE(data_emissao), MONTH)) AS Periodo,
      SUM(SAFE_CAST(parsed_multa_juros_proportional_value AS FLOAT64)) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')
      AND EXTRACT(YEAR FROM data_emissao) = @year
    GROUP BY Periodo
  `;
  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as JurosMultaAgg[];
} 