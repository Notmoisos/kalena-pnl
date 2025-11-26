import { BigQuery } from '@google-cloud/bigquery';
const bq=new BigQuery({ projectId:process.env.BQ_PROJECT_ID, keyFilename:process.env.BQ_KEYFILE });
export type CogsKind='CPV'|'CPV_Boni'|'Perdas'|'CPV_Devol';
export interface CogsAgg{Periodo:string;kind:CogsKind;valor:number;sign:'+'|'-';}
export interface CogsDetail{produto:string;n_nfes:number;valor_total:number;}

export async function fetchCogsAggregates(year:number):Promise<CogsAgg[]>{
  const sql=`WITH base AS (
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH) AS p,'CPV' AS k,
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64) amt
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não'
      AND (nome_cenario='Venda' OR nome_cenario='Inativo')
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'CPV_Boni',
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'Perdas',
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Baixa de estoque - Perda'
    UNION ALL
    SELECT DATE_TRUNC(DATE(data_emissao),MONTH),'CPV_Devol',
           SAFE_CAST(parsed_unit_cost*parsed_quantity_units AS FLOAT64)
    FROM \`${process.env.BQ_TABLE}\`
    WHERE finalidade='Devolução' AND cancelada='Não')
  SELECT FORMAT_DATE('%Y-%m',p) AS Periodo,
         k  AS kind,
         SUM(amt) AS valor,
         CASE k WHEN 'CPV_Devol' THEN '-' ELSE '+' END AS sign
  FROM base WHERE EXTRACT(YEAR FROM p)=@year GROUP BY Periodo,kind`;
  const [rows]=await bq.query({query:sql,params:{year}}); return rows as CogsAgg[];
}

export async function fetchCogsDetails(ym:string,kind:CogsKind):Promise<CogsDetail[]>{
  const filter=kind==='CPV'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND (nome_cenario='Venda' OR nome_cenario='Inativo')`:
               kind==='CPV_Boni'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Bonificação'`:
               kind==='Perdas'?`tipo_operacao='Saída' AND finalidade='Normal/Venda' AND cancelada='Não' AND nome_cenario='Baixa de estoque - Perda'`:
               /* devol */     `finalidade='Devolução' AND cancelada='Não'`;
  const sql=`SELECT parsed_x_prod_value produto,COUNT(*) n_nfes,SUM(parsed_unit_cost*parsed_quantity_units) valor_total
             FROM \`${process.env.BQ_TABLE}\` WHERE ${filter} AND FORMAT_DATE('%Y-%m',DATE(data_emissao))=@ym
             GROUP BY produto ORDER BY valor_total DESC LIMIT 300`;
  const [rows]=await bq.query({query:sql,params:{ym}});return rows as CogsDetail[];
} 