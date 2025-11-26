import { NextRequest, NextResponse } from 'next/server';
import { getMysqlPool } from '@/lib/db';

// Define a type for the detailed rows we expect to return
interface FinancialRevenueDetailRow {
  dev_id: string;
  data_lancamento_raw: string;
  valor: number;
  observacao: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month'); // Expecting MM format e.g., '01', '12'
  const catSup = searchParams.get('catSup'); // categoria_descricao_superior
  const catDesc = searchParams.get('catDesc'); // categoria_descricao

  if (!year || !month || !catSup || !catDesc) {
    return NextResponse.json({ error: 'Missing required query parameters: year, month, catSup, catDesc' }, { status: 400 });
  }

  const ym = `${year}-${String(month).padStart(2, '0')}`;

  try {
    const pool = await getMysqlPool();
    const sql = `
      SELECT
          l.dev_id,
          JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.dDtLanc'))   AS data_lancamento_raw,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.nValorLanc')) AS DECIMAL(15,2)) AS valor,
          JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cObs'))       AS observacao
      FROM
          omie_contas_correntes_lancamentos_api l
      JOIN
          omie_categorias_api cat ON JSON_UNQUOTE(JSON_EXTRACT(l.detalhes, '$.cCodCateg')) = cat.codigo
                                    AND l.nome_projeto = cat.nome_projeto
      JOIN
          omie_categorias_api cat2 ON cat.categoria_superior = cat2.codigo
                                     AND l.nome_projeto = cat2.nome_projeto
      WHERE
          cat2.descricao = ? 
          AND cat.descricao = ? 
          AND DATE_FORMAT(STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(l.cabecalho, '$.dDtLanc')), '%d/%m/%Y'), '%Y-%m') = ?;
    `;

    const [rows] = await pool.execute<any[]>(sql, [catSup, catDesc, ym]);
    return NextResponse.json(rows as FinancialRevenueDetailRow[]);
  } catch (error) {
    console.error('Error fetching financial revenue details:', error);
    return NextResponse.json({ error: 'Failed to fetch financial revenue details' }, { status: 500 });
  }
} 