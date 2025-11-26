import { NextResponse } from 'next/server';
import { fetchNfeDetails, RevKind } from '@/lib/nfeRevenue';
import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily';
import { fetchProductDetails } from '@/lib/nfeProduct';
import type { FamilyApiRow } from '@/lib/nfeFamily';
import type { ProductApiRow } from '@/lib/nfeProduct';

/** Hardcoded family data for ReceitaBruta in January 2025 */
function getExtraFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Bebidas", ym: "2025-01", valor: 1740.2 },
    { familia: "Edamame", ym: "2025-01", valor: 574084.97 },
    { familia: "Iguarias", ym: "2025-01", valor: 237544.44 },
    { familia: "Refeicoes e petiscos", ym: "2025-01", valor: 24564.37 },
    { familia: "Snack algas", ym: "2025-01", valor: 199634.42 },
    { familia: "Snacks doces", ym: "2025-01", valor: 8601.7 },
    { familia: "Snacks salgados", ym: "2025-01", valor: 17018.48 },
    { familia: "Temperos", ym: "2025-01", valor: 8868.81 },
    { familia: "Wakame", ym: "2025-01", valor: 96653.5 },
  ];
}

/** Hardcoded family data for Devolucao in January 2025 */
function getExtraDevolucaoFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Edamame", ym: "2025-01", valor: 7835.02 },
    { familia: "Iguarias", ym: "2025-01", valor: 8716.29 },
    { familia: "Refeicoes e petiscos", ym: "2025-01", valor: 253.28 },
    { familia: "Snack algas", ym: "2025-01", valor: 2274.24 },
    { familia: "Temperos", ym: "2025-01", valor: 1488.52 },
    { familia: "Wakame", ym: "2025-01", valor: 168 },
  ];
}

/** Hardcoded product data for ReceitaBruta in January 2025 */
function getExtraProductRows2025(): ProductApiRow[] {
  return [
    { produto: "EDAMAME REPEAT 300G X 36 S/ SAL", ym: "2025-01", valor: 9174.65 },
    { produto: "FS - BLACK COD HG", ym: "2025-01", valor: 25515.19 },
    { produto: "FS - CAVALINHA MARINADA FILES", ym: "2025-01", valor: 10587.45 },
    { produto: "FS - EDAMAME GRAOS (SOJA VERDE) REPEAT 1KG X 10", ym: "2025-01", valor: 209392.08 },
    { produto: "FS - EDAMAME REPEAT 1KG X 10", ym: "2025-01", valor: 242334.66 },
    { produto: "FS - OVAS DE MASSAGO - GREEN", ym: "2025-01", valor: 1419.7 },
    { produto: "FS - OVAS DE MASSAGO - ORANGE", ym: "2025-01", valor: 19577.1 },
    { produto: "FS - PASTA DE WASABI 200g", ym: "2025-01", valor: 416.5 },
    { produto: "FS - PASTA DE WASABI 60 x 200g", ym: "2025-01", valor: 333.33 },
    { produto: "FS - SRIRACHA ORIGINAL 455g X 12", ym: "2025-01", valor: 5579 },
    { produto: "FS - UNAGI 5 KG", ym: "2025-01", valor: 13260 },
    { produto: "FS - WAKAME 1,001 KG x 10", ym: "2025-01", valor: 93363.79 },
    { produto: "FS - YELLOWTAIL FILES", ym: "2025-01", valor: 167185 },
    { produto: "VA - SRIRACHA MAYO 200g X 12", ym: "2025-01", valor: 1694.92 },
    { produto: "VA - BOLINHO DE ARROZ REPEAT 200g x 16", ym: "2025-01", valor: 4016.67 },
    { produto: "VA - BOLINHO DE COUVE FLOR REPEAT 200g x 16", ym: "2025-01", valor: 5577.3 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE 50g x 12", ym: "2025-01", valor: 2719.79 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE, CARAMELO E FLOR DE SAL 50g x 12", ym: "2025-01", valor: 3783.01 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC MEIO AMARGO 50g x 12", ym: "2025-01", valor: 2098.9 },
    { produto: "VA - DADINHO DE TAPIOCA 250g x 16", ym: "2025-01", valor: 5005.47 },
    { produto: "VA - EDAMAME GRAOS REPEAT 300g x 18", ym: "2025-01", valor: 52871.97 },
    { produto: "VA - EDAMAME VAGEM REPEAT 300g x 18", ym: "2025-01", valor: 60311.61 },
    { produto: "VA - FALAFEL COM EDAMAME REPEAT 200g x 16", ym: "2025-01", valor: 9964.93 },
    { produto: "VA - MATCHA LATTE 150g x 12", ym: "2025-01", valor: 1740.2 },
    { produto: "VA - PARMESAO CROCANTE CEBOLA & SALSA 25g X 12", ym: "2025-01", valor: 1287.75 },
    { produto: "VA - PARMESAO CROCANTE ORIGINAL 25g x12", ym: "2025-01", valor: 1405.79 },
    { produto: "VA - SNACK ALGA BARBECUE REPEAT 5G X 24", ym: "2025-01", valor: 28918.12 },
    { produto: "VA - SNACK ALGA ORIGINAL REPEAT 5G X 24", ym: "2025-01", valor: 134474.85 },
    { produto: "VA - SNACK ALGA WASABI REPEAT 5G X 24", ym: "2025-01", valor: 36241.45 },
    { produto: "VA - SNACK DE ARROZ CROCANTE QUEIJO 40g x 18", ym: "2025-01", valor: 6105.6 },
    { produto: "VA - SNACK DE ARROZ CROCANTE SHOYU 40g x 18", ym: "2025-01", valor: 4707 },
    { produto: "VA - SNACK DE ARROZ CROCANTE TOMATE 40g x 18", ym: "2025-01", valor: 3512.34 },
    { produto: "VA - SRIRACHA ORIGINAL 200g X 24", ym: "2025-01", valor: 845.06 },
    { produto: "VA - WAKAME 125g X 21", ym: "2025-01", valor: 3289.71 },
  ];
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const kind = p.get('kind') ?? '';
  const year = p.get('year') ?? (ym ? ym.slice(0, 4) : '');
  const breakdown = p.get('breakdown');

  // --- family drill-down -------------------------------------------
  if (breakdown === 'family') {
    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 });
    if (!['ReceitaBruta','Devolucao','Desconto'].includes(kind))
      return NextResponse.json({ error: 'unsupported kind' }, { status: 400 });
    // Fetch existing family details
    const rows = await fetchFamilyDetails(year, kind as FamilyKind);
    // Hardcode additional data for 2025-01 ReceitaBruta
    if (year === '2025' && kind === 'ReceitaBruta') {
      for (const e of getExtraFamilyRows2025()) {
        const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym);
        if (idx >= 0) rows[idx].valor += e.valor;
        else rows.push(e);
      }
    }
    // Hardcode additional data for 2025-01 Devolucao
    if (year === '2025' && kind === 'Devolucao') {
      for (const e of getExtraDevolucaoFamilyRows2025()) {
        const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym);
        if (idx >= 0) rows[idx].valor += e.valor;
        else rows.push(e);
      }
    }
    return NextResponse.json(rows);
  }
  // -----------------------------------------------------------------

  if (breakdown === 'product') {
    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 });
    if (['ReceitaBruta','Devolucao','Desconto'].includes(kind)) {
      const rows = await fetchProductDetails(year, kind as FamilyKind);
      // Hardcode additional data for 2025-01 ReceitaBruta
      if (year === '2025' && kind === 'ReceitaBruta') {
        for (const e of getExtraProductRows2025()) {
          const idx = rows.findIndex(r => r.produto === e.produto && r.ym === e.ym);
          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push(e);
        }
      }
      return NextResponse.json(rows);
    }
    return NextResponse.json({ error: 'unsupported kind for product breakdown' }, { status: 400 });
  }

  // legacy single-month details (used by all existing modals)
  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) ||
      !['ReceitaBruta', 'Devolucao', 'Desconto'].includes(kind))
    return NextResponse.json({ error: 'bad params' }, { status: 400 });

  return NextResponse.json(await fetchNfeDetails(ym, kind as RevKind));
} 