import { BigQuery } from '@google-cloud/bigquery'
import { FamilyKind } from './nfeFamily'

const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.BQ_KEYFILE,
})

export interface ProductApiRow {
  produto: string       // parsed_x_prod_value
  ym: string            // 'YYYY-MM'
  valor: number
}

export async function fetchProductDetails(
  year: string,
  kind: FamilyKind
): Promise<ProductApiRow[]> {
  let filter = ''
  let selector = ''

  switch (kind) {
    case 'ReceitaBruta':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      selector = 'parsed_total_product_value + parsed_frete_value'
      break
    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      selector = 'parsed_total_product_value + parsed_frete_value'
      break
    case 'Desconto':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')
                AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`
      selector = 'parsed_desconto_proportional_value'
      break
    case 'CPV':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break
    case 'CPV_Boni':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Bonificação'`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break
    case 'Perdas':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Baixa de estoque - Perda'`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break
    case 'CPV_Devol':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      selector = 'parsed_unit_cost * parsed_quantity_units'
      break
    default:
      throw new Error(`Unsupported kind for product breakdown: ${kind}`)
  }

  const sql = `
    SELECT
      parsed_x_prod_value AS produto,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY produto, ym
    ORDER BY ym, valor DESC
    LIMIT 500
  `
  const [rows] = await bq.query({ query: sql, params: { year } })
  return rows as ProductApiRow[]
} 