import { getBigQuery } from './bq';
const bq = getBigQuery();

export type CogsKind = 'CPV' | 'CPV_Boni' | 'Perdas' | 'CPV_Devol';

export interface CogsAgg {
  Periodo: string;
  kind: CogsKind;
  valor: number;
  sign: '+' | '-';
}

export interface CogsDetail {
  produto: string;
  n_nfes: number;
  valor_total: number;
}

export async function fetchCogsAggregates(year: number): Promise<CogsAgg[]> {
  const sql = `
    WITH base AS (
      SELECT
        DATE_TRUNC(DATE(data_emissao), MONTH) AS p,
        'CPV' AS k,
        SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64) AS amt
      FROM \`${process.env.BQ_TABLE}\`
      WHERE tipo_operacao = 'Saída'
        AND finalidade = 'Normal/Venda'
        AND cancelada = 'Não'
        AND (nome_cenario = 'Venda' OR nome_cenario = 'Inativo')

      UNION ALL

      SELECT
        DATE_TRUNC(DATE(data_emissao), MONTH) AS p,
        'CPV_Boni' AS k,
        SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64) AS amt
      FROM \`${process.env.BQ_TABLE}\`
      WHERE tipo_operacao = 'Saída'
        AND finalidade = 'Normal/Venda'
        AND cancelada = 'Não'
        AND nome_cenario LIKE '%Bonificação%'

      UNION ALL

      SELECT
        DATE_TRUNC(DATE(data_emissao), MONTH) AS p,
        'Perdas' AS k,
        SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64) AS amt
      FROM \`${process.env.BQ_TABLE}\`
      WHERE tipo_operacao = 'Saída'
        AND finalidade = 'Normal/Venda'
        AND cancelada = 'Não'
        AND nome_cenario = 'Baixa de estoque - Perda'

      UNION ALL

      SELECT
        DATE_TRUNC(DATE(data_emissao), MONTH) AS p,
        'CPV_Devol' AS k,
        SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64) AS amt
      FROM \`${process.env.BQ_TABLE}\`
      WHERE finalidade = 'Devolução'
        AND cancelada = 'Não'
    )
    SELECT
      FORMAT_DATE('%Y-%m', p) AS Periodo,
      k AS kind,
      SUM(amt) AS valor,
      CASE WHEN k = 'CPV_Devol' THEN '-' ELSE '+' END AS sign
    FROM base
    WHERE EXTRACT(YEAR FROM p) = @year
    GROUP BY Periodo, kind
    ORDER BY Periodo, kind
  `;

  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as CogsAgg[];
}

export async function fetchCogsDetails(ym: string, kind: CogsKind): Promise<CogsDetail[]> {
  const filter =
    kind === 'CPV'
      ? `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      : kind === 'CPV_Boni'
      ? `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario LIKE '%Bonificação%'`
      : kind === 'Perdas'
      ? `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Baixa de estoque - Perda'`
      : `finalidade='Devolução' AND cancelada='Não'`;

  const sql = `
    SELECT
      COALESCE(produto_norm, parsed_x_prod_value_norm, parsed_x_prod_value_raw, parsed_x_prod_value) AS produto,
      COUNT(*) AS n_nfes,
      SUM(SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64)) AS valor_total
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y-%m', DATE(data_emissao)) = @ym
    GROUP BY produto
    ORDER BY valor_total DESC
    LIMIT 300
  `;

  const [rows] = await bq.query({ query: sql, params: { ym } });
  return rows as CogsDetail[];
}