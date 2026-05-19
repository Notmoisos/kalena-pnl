import { getBigQuery } from './bq'

export type RawOnlineTax = {
  Periodo: string
  valor: number
}

const BLING_TABLE = process.env.BQ_TABLE_BLING || 'kalenapnl.kalena.etl_notas_bling'

export async function fetchOnlineTaxRows(year: number): Promise<RawOnlineTax[]> {
  const sql = `
    SELECT
      FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE(data_emissao), MONTH)) AS Periodo,
      SUM(
        COALESCE(SAFE_CAST(parsed_icms_value AS FLOAT64), 0) +
        COALESCE(SAFE_CAST(parsed_pis_value AS FLOAT64), 0) +
        COALESCE(SAFE_CAST(parsed_cofins_value AS FLOAT64), 0) +
        COALESCE(SAFE_CAST(parsed_ipi_value AS FLOAT64), 0) +
        COALESCE(SAFE_CAST(parsed_fcp_value AS FLOAT64), 0)
      ) AS valor
    FROM \`${BLING_TABLE}\`
    WHERE EXTRACT(YEAR FROM DATE(data_emissao)) = @year
      AND doc_source = 'BLING'
      AND cancelada = 'Não'
      AND finalidade = 'Normal/Venda'
    GROUP BY Periodo
    ORDER BY Periodo
  `

  const [rows] = await getBigQuery().query({ query: sql, params: { year } })
  return rows as RawOnlineTax[]
}
