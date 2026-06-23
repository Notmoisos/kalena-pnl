import { getBigQuery } from './bq';
import { DISCOUNT_BASE_FILTER, RETURNS_BASE_FILTER, SALES_BASE_FILTER } from './nfeFilters';

const bq = getBigQuery();

export type RevKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto';

export interface RevAgg {
  Periodo: string;
  kind: RevKind;
  valor: number;
  sign: '+' | '-';
}

export interface NfeDetail {
  produto: string;
  n_nfes: number;
  valor_total: number;
}

export interface JurosMultaAgg {
  Periodo: string;
  valor: number;
}

export async function fetchRevenueAggregates(year: number): Promise<RevAgg[]> {
  const sql = `WITH base AS (
    SELECT
      DATE_TRUNC(DATE(data_emissao), MONTH) AS period,
      'ReceitaBruta' AS kind,
      COALESCE(SAFE_CAST(parsed_total_product_value AS FLOAT64), 0)
        + COALESCE(SAFE_CAST(parsed_frete_value AS FLOAT64), 0) AS amount
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${SALES_BASE_FILTER}

    UNION ALL

    SELECT
      DATE_TRUNC(DATE(data_emissao), MONTH),
      'Devolucao',
      COALESCE(SAFE_CAST(parsed_total_product_value AS FLOAT64), 0)
        + COALESCE(SAFE_CAST(parsed_frete_value AS FLOAT64), 0)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${RETURNS_BASE_FILTER}

    UNION ALL

    SELECT
      DATE_TRUNC(DATE(data_emissao), MONTH),
      'Desconto',
      COALESCE(SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64), 0)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${DISCOUNT_BASE_FILTER}
  )
  SELECT
    FORMAT_DATE('%Y-%m', period) AS Periodo,
    kind,
    SUM(amount) AS valor,
    CASE kind
      WHEN 'Devolucao' THEN '-'
      WHEN 'Desconto' THEN '-'
      ELSE '+'
    END AS sign
  FROM base
  WHERE EXTRACT(YEAR FROM period) = @year
  GROUP BY Periodo, kind`;

  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as RevAgg[];
}

export async function fetchNfeDetails(ym: string, kind: RevKind): Promise<NfeDetail[]> {
  let filter: string;
  let valueColumn: string;
  const groupByColumn =
    'COALESCE(produto_norm, parsed_x_prod_value_norm, parsed_x_prod_value_raw, parsed_x_prod_value)';

  switch (kind) {
    case 'ReceitaBruta':
      filter = SALES_BASE_FILTER;
      valueColumn =
        'SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)';
      break;
    case 'Devolucao':
      filter = RETURNS_BASE_FILTER;
      valueColumn =
        'SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)';
      break;
    case 'Desconto':
      filter = DISCOUNT_BASE_FILTER;
      valueColumn = 'SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64)';
      break;
    default:
      console.error('Invalid kind received in fetchNfeDetails:', kind);
      return [];
  }

  const sql = `SELECT
    ${groupByColumn} AS produto,
    COUNT(*) AS n_nfes,
    SUM(${valueColumn}) AS valor_total
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y-%m', DATE(data_emissao)) = @ym
    GROUP BY produto
    ORDER BY valor_total DESC`;

  const [rows] = await bq.query({ query: sql, params: { ym } });
  return rows as NfeDetail[];
}

export async function fetchJurosMultaAggregates(year: number): Promise<JurosMultaAgg[]> {
  const sql = `
    SELECT
      FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE(data_emissao), MONTH)) AS Periodo,
      SUM(SAFE_CAST(parsed_multa_juros_proportional_value AS FLOAT64)) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${SALES_BASE_FILTER}
      AND EXTRACT(YEAR FROM data_emissao) = @year
    GROUP BY Periodo
  `;

  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as JurosMultaAgg[];
}
