import { NextResponse } from 'next/server';
import { fetchDespesaDetails } from '@/lib/despesaDetails';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ym   = searchParams.get('ym')   ?? '';
  const code = searchParams.get('code') ?? '';
  const cat  = searchParams.get('cat')  ?? '';

  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !code || !cat) {
    return NextResponse.json({ error: 'bad params' }, { status: 400 });
  }

  try {
    const rows = await fetchDespesaDetails({ ym, code, cat });
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'db failure' }, { status: 500 });
  }
}
 