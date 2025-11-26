import { NextResponse } from 'next/server';
import { fetchTaxDetails } from '@/lib/nfe';

const ALLOWED_TAX_NAMES = ['PIS', 'Cofins', 'ISS', 'IR', 'FCP', 'ICMS', 'ICMS_ST', 'FCP_ST', 'IPI'];
const ALLOWED_SCENARIOS = ['Venda', 'Bonificacao', 'Devolucao'];

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const taxName = p.get('taxName') ?? '';
  const scenario = p.get('scenario') ?? '';


  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) ||
      !ALLOWED_TAX_NAMES.includes(taxName) ||
      !ALLOWED_SCENARIOS.includes(scenario)) {
    return NextResponse.json({ error: 'bad params' }, { status: 400 });
  }

  try {
    const details = await fetchTaxDetails(ym, taxName, scenario);
    return NextResponse.json(details);
  } catch (error) {
    console.error(`API error fetching tax details for ${taxName}/${scenario}/${ym}:`, error);
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs'; 