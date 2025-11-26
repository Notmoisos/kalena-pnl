import { getBigQuery } from './bq'

// ────────── Shared Types ──────────
export type RawTax = {
  Periodo: string                                 // YYYY‑MM
  tax_name: string                                // 'PIS', 'Cofins', …
  scenario: 'Venda' | 'Bonificacao' | 'Devolucao'
  valor: number                                   // already signed (− for devolucao)
}

export interface TaxDetail {
  produto: string;
  n_nfes: number;
  valor_total: number;
}

const taxColumnMap: Record<string, string> = {
  'PIS': 'parsed_pis_value',
  'Cofins': 'parsed_cofins_value',
  'ISS': 'parsed_iss_value',
  'IR': 'parsed_ir_value',
  'FCP': 'parsed_fcp_value',
  'ICMS': 'parsed_icms_value',
  'ICMS_ST': 'parsed_icmsst_value',
  'FCP_ST': 'parsed_fcpst_value',
  'IPI': 'parsed_ipi_value',
};

// ────────── 1.  Revenue‑related taxes  (#3) ──────────
export async function fetchRevenueTaxRows(year: number): Promise<RawTax[]> {
  const sql = `
  WITH union_all AS (
    -- Venda
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period, 'Venda' AS scenario,
      SAFE_CAST(parsed_pis_value           AS FLOAT64) AS pis,
      SAFE_CAST(parsed_cofins_value        AS FLOAT64) AS cofins,
      SAFE_CAST(parsed_iss_value           AS FLOAT64) AS iss,
      SAFE_CAST(parsed_ir_value            AS FLOAT64) AS ir,
      SAFE_CAST(parsed_fcp_value           AS FLOAT64) AS fcp,
      SAFE_CAST(parsed_icm_dest_value      AS FLOAT64) AS icms_dest,
      SAFE_CAST(parsed_icm_remet_value     AS FLOAT64) AS icms_remet,
      SAFE_CAST(parsed_icms_value          AS FLOAT64) AS icms,
      SAFE_CAST(parsed_ipi_value           AS FLOAT64) AS ipi
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')

    UNION ALL
    -- Bonificação
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Bonificacao',
      SAFE_CAST(parsed_pis_value AS FLOAT64),
      SAFE_CAST(parsed_cofins_value AS FLOAT64),
      SAFE_CAST(parsed_iss_value AS FLOAT64),
      SAFE_CAST(parsed_ir_value AS FLOAT64),
      SAFE_CAST(parsed_fcp_value AS FLOAT64),
      SAFE_CAST(parsed_icm_dest_value AS FLOAT64),
      SAFE_CAST(parsed_icm_remet_value AS FLOAT64),
      SAFE_CAST(parsed_icms_value AS FLOAT64),
      SAFE_CAST(parsed_ipi_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND nome_cenario='Bonificação'

    UNION ALL
    -- Devolução  (sign flip)
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH), 'Devolucao',
      -SAFE_CAST(parsed_pis_value AS FLOAT64),
      -SAFE_CAST(parsed_cofins_value AS FLOAT64),
      -SAFE_CAST(parsed_iss_value AS FLOAT64),
      -SAFE_CAST(parsed_ir_value AS FLOAT64),
      -SAFE_CAST(parsed_fcp_value AS FLOAT64),
      -SAFE_CAST(parsed_icm_dest_value AS FLOAT64),
      -SAFE_CAST(parsed_icm_remet_value AS FLOAT64),
      -SAFE_CAST(parsed_icms_value AS FLOAT64),
      -SAFE_CAST(parsed_ipi_value AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND finalidade='Devolução'
      AND cancelada='Não'
  )

  SELECT FORMAT_DATE('%Y-%m', period) AS Periodo, tax_name, scenario, SUM(tax_val) AS valor
  FROM union_all,
    UNNEST([
      STRUCT('PIS'    AS tax_name, pis                              AS tax_val),
      STRUCT('Cofins' AS tax_name, cofins                           AS tax_val),
      STRUCT('ISS'    AS tax_name, iss                              AS tax_val),
      STRUCT('IR'     AS tax_name, ir                               AS tax_val),
      STRUCT('FCP'    AS tax_name, fcp                              AS tax_val),
      STRUCT('ICMS'   AS tax_name, icms_dest + icms_remet + icms    AS tax_val),
      STRUCT('IPI'    AS tax_name, ipi                              AS tax_val)
    ])
  GROUP BY Periodo, tax_name, scenario
  ORDER BY Periodo;`

  const [rows] = await getBigQuery().query({ query: sql, params: { year } })
  return rows as RawTax[]
}

// ────────── 2.  ST‑related taxes  (#4) ──────────
export async function fetchStTaxRows(year: number): Promise<RawTax[]> {
  const sql = `
  WITH union_all AS (
    -- Venda & Inativo
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period, 'Venda' AS scenario,
      SAFE_CAST(parsed_icmsst_value AS FLOAT64) AS icms_st,
      SAFE_CAST(parsed_fcpst_value  AS FLOAT64) AS fcp_st
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')

    UNION ALL
    -- Bonificação
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period, 'Bonificacao' AS scenario,
      SAFE_CAST(parsed_icmsst_value AS FLOAT64),
      SAFE_CAST(parsed_fcpst_value  AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND tipo_operacao='Saída'
      AND finalidade='Normal/Venda'
      AND cancelada='Não'
      AND nome_cenario='Bonificação'

    UNION ALL
    -- Devolução (sign flip)
    SELECT DATE_TRUNC(DATE(data_emissao), MONTH) AS period, 'Devolucao' AS scenario,
      -SAFE_CAST(parsed_icmsst_value AS FLOAT64),
      -SAFE_CAST(parsed_fcpst_value  AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND finalidade='Devolução'
      AND cancelada='Não'
  )

  SELECT FORMAT_DATE('%Y-%m', period) AS Periodo, tax_name, scenario, SUM(tax_val) AS valor
  FROM union_all,
    UNNEST([
      STRUCT('ICMS_ST' AS tax_name, icms_st AS tax_val),
      STRUCT('FCP_ST'  AS tax_name, fcp_st  AS tax_val)
    ])
  GROUP BY Periodo, tax_name, scenario
  ORDER BY Periodo;`

  const [rows] = await getBigQuery().query({ query: sql, params: { year } })
  return rows as RawTax[]
}

export async function fetchTaxDetails(ym: string, taxName: string, scenario: string): Promise<TaxDetail[]> {
  const taxColumn = taxColumnMap[taxName];
  if (!taxColumn) {
    console.error(`Invalid taxName received: ${taxName}`);
    return [];
  }
  let scenarioFilter: string;
  let signMultiplier = 1;
  if (scenario === 'Venda') {
    scenarioFilter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`;
  } else if (scenario === 'Bonificacao') {
    scenarioFilter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'`;
  } else if (scenario === 'Devolucao') {
    scenarioFilter = `finalidade='Devolução' AND cancelada='Não'`;
    signMultiplier = -1;
  } else {
    console.error(`Invalid scenario received: ${scenario}`);
    return [];
  }
  const sql = `
    SELECT
      parsed_x_prod_value AS produto,
      COUNT(*) AS n_nfes,
      SUM(SAFE_CAST(${taxColumn} AS FLOAT64) * ${signMultiplier}) AS valor_total
    FROM
      \`${process.env.BQ_TABLE}\`
    WHERE
      ${scenarioFilter}
      AND FORMAT_DATE('%Y-%m', DATE(data_emissao)) = @ym
      AND SAFE_CAST(${taxColumn} AS FLOAT64) IS NOT NULL
      AND SAFE_CAST(${taxColumn} AS FLOAT64) != 0
    GROUP BY
      produto
    ORDER BY
      valor_total DESC
    LIMIT 300;
  `;
  try {
    const [rows] = await getBigQuery().query({ query: sql, params: { ym } });
    return rows as TaxDetail[];
  } catch (error) {
    console.error('Error fetching tax details from BigQuery:', error);
    return [];
  }
} 