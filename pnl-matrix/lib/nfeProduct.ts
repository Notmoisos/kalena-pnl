import { FamilyKind } from './nfeFamily'
import { getBigQuery } from './bq'

const bq = getBigQuery()

export interface ProductApiRow {
  produto: string
  ym: string
  valor: number
}

function bqTableId(): string {
  const t = process.env.BQ_TABLE
  if (!t) throw new Error('BQ_TABLE is not set')
  return t.startsWith('`') ? t : `\`${t}\``
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
      selector = 'SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)'
      break
    case 'Devolucao':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      selector = 'SAFE_CAST(parsed_total_product_value AS FLOAT64) + SAFE_CAST(parsed_frete_value AS FLOAT64)'
      break
    case 'Desconto':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')
                AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`
      selector = 'SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64)'
      break
    case 'CPV':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND (nome_cenario='Venda' OR nome_cenario='Inativo')`
      selector = 'SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64)'
      break
    case 'CPV_Boni':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Bonificação'`
      selector = 'SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64)'
      break
    case 'Perdas':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Baixa de estoque - Perda'`
      selector = 'SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64)'
      break
    case 'CPV_Devol':
      filter = `finalidade='Devolução' AND cancelada='Não'`
      selector = 'SAFE_CAST(parsed_unit_cost AS FLOAT64) * SAFE_CAST(parsed_quantity_units AS FLOAT64)'
      break
    default:
      throw new Error(`Unsupported kind for product breakdown: ${kind}`)
  }

  const T = bqTableId()

  const sql = `
    SELECT
      COALESCE(produto_norm, parsed_x_prod_value_norm, parsed_x_prod_value_raw, parsed_x_prod_value) AS produto,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
    FROM ${T}
    WHERE ${filter}
      AND EXTRACT(YEAR FROM DATE(data_emissao)) = @year
    GROUP BY produto, ym
    ORDER BY ym, valor DESC
  `

  const [rows] = await bq.query({ query: sql, params: { year: Number(year) } })
  return rows as ProductApiRow[]
}