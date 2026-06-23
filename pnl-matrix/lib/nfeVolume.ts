import { FamilyApiRow } from './nfeFamily'
import { ProductApiRow } from './nfeProduct'
import { getBigQuery } from './bq';
import { RETURNS_BASE_FILTER, SALES_BASE_FILTER } from './nfeFilters';

const bq = getBigQuery();

type VolumeKind = 'ReceitaBruta' | 'Devolucao'

export async function fetchVolumeFamilyDetails(
  year: string,
  kind: VolumeKind
): Promise<FamilyApiRow[]> {
  let filter = ''
  switch (kind) {
    case 'ReceitaBruta':
      filter = SALES_BASE_FILTER
      break
    case 'Devolucao':
      filter = RETURNS_BASE_FILTER
      break
  }
  const sql = `
    SELECT
      FORMAT('%s (%s)', descricao_familia,
        CASE WHEN parsed_type_unit IN ('CAIXA','CX') THEN 'CX' ELSE parsed_type_unit END
      ) AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(parsed_quantity_units) AS FLOAT64) AS valor
    FROM 
      ${process.env.BQ_TABLE}
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
  `
  const [rows] = await bq.query({ query: sql, params: { year } })
  return rows as FamilyApiRow[]
}

export async function fetchVolumeProductDetails(
  year: string,
  kind: VolumeKind
): Promise<ProductApiRow[]> {
  let filter = ''
  switch (kind) {
    case 'ReceitaBruta':
      filter = SALES_BASE_FILTER
      break
    case 'Devolucao':
      filter = RETURNS_BASE_FILTER
      break
  }

  const sql = `
    SELECT
      FORMAT(
        '%s (%s)',
        COALESCE(produto_norm, parsed_x_prod_value_norm, parsed_x_prod_value_raw, parsed_x_prod_value),
        CASE WHEN parsed_type_unit IN ('CAIXA','CX') THEN 'CX' ELSE parsed_type_unit END
      ) AS produto,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(parsed_quantity_units) AS FLOAT64) AS valor
    FROM ${process.env.BQ_TABLE}
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY produto, ym
    ORDER BY ym, valor DESC
  `
  const [rows] = await bq.query({ query: sql, params: { year } })
  return rows as ProductApiRow[]
}
