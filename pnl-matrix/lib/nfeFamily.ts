import { getBigQuery } from './bq';
import { DISCOUNT_BASE_FILTER, RETURNS_BASE_FILTER, SALES_BASE_FILTER } from './nfeFilters';

const bq = getBigQuery();

export interface FamilyApiRow {
  familia: string
  ym: string
  valor: number
}

export type FamilyKind = 'ReceitaBruta' | 'Devolucao' | 'Desconto' | 'CPV' | 'CPV_Boni' | 'Perdas' | 'CPV_Devol';

export async function fetchFamilyDetails(
  year: string,
  kind: FamilyKind = 'ReceitaBruta'
): Promise<FamilyApiRow[]> {
  let filter = '';
  let selector = '';

  switch (kind) {
    case 'ReceitaBruta':
      filter = SALES_BASE_FILTER;
      selector = 'parsed_total_product_value + parsed_frete_value';
      break;
    case 'Devolucao':
      filter = RETURNS_BASE_FILTER;
      selector = 'parsed_total_product_value + parsed_frete_value';
      break;
    case 'Desconto':
      filter = DISCOUNT_BASE_FILTER;
      selector = 'parsed_desconto_proportional_value';
      break;
    case 'CPV':
      filter = SALES_BASE_FILTER;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;
    case 'CPV_Boni':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario LIKE '%Bonificação%'`;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;
    case 'Perdas':
      filter = `tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
                AND nome_cenario='Baixa de estoque - Perda'`;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;
    case 'CPV_Devol':
      filter = RETURNS_BASE_FILTER;
      selector = 'parsed_unit_cost * parsed_quantity_units';
      break;
    default:
      const exhaustiveCheck: never = kind;
      throw new Error(`Unsupported kind for family breakdown: ${exhaustiveCheck}`);
  }

  const sql = `
    SELECT
      descricao_familia AS familia,
      FORMAT_DATE('%Y-%m', DATE(data_emissao)) AS ym,
      SAFE_CAST(SUM(${selector}) AS FLOAT64) AS valor
    FROM \`${process.env.BQ_TABLE}\`
    WHERE ${filter}
      AND FORMAT_DATE('%Y', DATE(data_emissao)) = @year
    GROUP BY familia, ym
    ORDER BY ym, valor DESC
    LIMIT 500`;
  const [rows] = await bq.query({ query: sql, params: { year } });
  return rows as FamilyApiRow[];
}
