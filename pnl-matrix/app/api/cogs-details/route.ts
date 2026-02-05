import { NextResponse } from 'next/server';
import { fetchCogsDetails, CogsKind } from '@/lib/nfeCosts';
import { fetchFamilyDetails, FamilyKind } from '@/lib/nfeFamily';
import { fetchProductDetails } from '@/lib/nfeProduct';
import type { FamilyApiRow } from '@/lib/nfeFamily';
import type { ProductApiRow } from '@/lib/nfeProduct';
import { normalizeProductLabel } from '@/lib/normalizeProductLabel';

/** Hardcoded CPV family data for January 2025 */
function getExtraCpvFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Bebidas", ym: "2025-01", valor: 702.6931 },
    { familia: "Edamame", ym: "2025-01", valor: 271372.2997 },
    { familia: "Iguarias", ym: "2025-01", valor: 174251.8489 },
    { familia: "Online", ym: "2025-01", valor: 11.1537 },
    { familia: "Refeicoes e petiscos", ym: "2025-01", valor: 11970.674 },
    { familia: "Snacks algas", ym: "2025-01", valor: 89264.9409 },
    { familia: "Snacks doces", ym: "2025-01", valor: 6527.4484 },
    { familia: "Snacks salgados", ym: "2025-01", valor: 9596.9254 },
    { familia: "Temperos", ym: "2025-01", valor: 4554.4217 },
    { familia: "Wakame", ym: "2025-01", valor: 56427.0388 },
  ];
}

/** Hardcoded CPV product data for January 2025 */
function getExtraCpvProductRows2025(): ProductApiRow[] {
  return [
    { produto: "EDAMAME REPEAT 300G X 36 S/ SAL", ym: "2025-01", valor: 4825.2 },
    { produto: "FS - BLACK COD HG", ym: "2025-01", valor: 14175.6088 },
    { produto: "FS - CAVALINHA MARINADA FILES", ym: "2025-01", valor: 6154.3886 },
    { produto: "FS - EDAMAME GRAOS  (SOJA VERDE) REPEAT 1KG X 10", ym: "2025-01", valor: 108419.2401 },
    { produto: "FS - EDAMAME REPEAT 1KG X 10", ym: "2025-01", valor: 116748.1455 },
    { produto: "FS - OVAS DE MASSAGO - GREEN", ym: "2025-01", valor: 2053.0543 },
    { produto: "FS - OVAS DE MASSAGO - ORANGE", ym: "2025-01", valor: 23526.6461 },
    { produto: "FS - PASTA DE WASABI 200g", ym: "2025-01", valor: 180.6417 },
    { produto: "FS - PASTA DE WASABI 60 x 200g", ym: "2025-01", valor: 144.513 },
    { produto: "FS - SRIRACHA ORIGINAL 455g X 12", ym: "2025-01", valor: 2918.8426 },
    { produto: "FS - UNAGI 5 KG", ym: "2025-01", valor: 9522.147 },
    { produto: "FS - WAKAME 1,001 KG x 10", ym: "2025-01", valor: 54663.8592 },
    { produto: "FS - YELLOWTAIL FILES", ym: "2025-01", valor: 118820.0042 },
    { produto: "VA -  SRIRACHA MAYO 200g  X 12", ym: "2025-01", valor: 806.9801 },
    { produto: "VA - BOLINHO DE ARROZ REPEAT 200g x 16", ym: "2025-01", valor: 2013.3723 },
    { produto: "VA - BOLINHO DE COUVE FLOR REPEAT 200g x 16", ym: "2025-01", valor: 2601.6785 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE 50g x 12", ym: "2025-01", valor: 1814.244 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE, CARAMELO E FLOR DE SAL 50g x 12", ym: "2025-01", valor: 2608.2472 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC MEIO AMARGO 50g x 12", ym: "2025-01", valor: 2104.9572 },
    { produto: "VA - DADINHO DE TAPIOCA 250g x 16", ym: "2025-01", valor: 2454.261 },
    { produto: "VA - EDAMAME GRAOS REPEAT 300g x 18", ym: "2025-01", valor: 18057.1548 },
    { produto: "VA - EDAMAME VAGEM REPEAT 300g x 18", ym: "2025-01", valor: 23322.5594 },
    { produto: "VA - FALAFEL COM EDAMAME REPEAT 200g x 16", ym: "2025-01", valor: 4901.3623 },
    { produto: "VA - MATCHA LATTE 150g x 12", ym: "2025-01", valor: 702.6931 },
    { produto: "VA - PARMESAO CROCANTE CEBOLA & SALSA 25g X 12", ym: "2025-01", valor: 624.5468 },
    { produto: "VA - PARMESAO CROCANTE ORIGINAL 25g x12", ym: "2025-01", valor: 836.8553 },
    { produto: "VA - SNACK ALGA BARBECUE REPEAT 5G X 24", ym: "2025-01", valor: 12551.8716 },
    { produto: "VA - SNACK ALGA ORIGINAL REPEAT 5G X 24", ym: "2025-01", valor: 60499.6445 },
    { produto: "VA - SNACK ALGA WASABI REPEAT 5G X 24", ym: "2025-01", valor: 16213.4248 },
    { produto: "VA - SNACK DE ARROZ CROCANTE QUEIJO 40g x 18", ym: "2025-01", valor: 3568.9406 },
    { produto: "VA - SNACK DE ARROZ CROCANTE SHOYU 40g x 18", ym: "2025-01", valor: 2656.9722 },
    { produto: "VA - SNACK DE ARROZ CROCANTE TOMATE 40g x 18", ym: "2025-01", valor: 1909.6105 },
    { produto: "VA - SRIRACHA ORIGINAL 200g X 24", ym: "2025-01", valor: 503.4443 },
    { produto: "VA - WAKAME 125g X 21", ym: "2025-01", valor: 1763.1796 },
  ];
}

/** Hardcoded CPV_Boni family data for January 2025 */
function getExtraCpvBoniFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Bebidas", ym: "2025-01", valor: 100.3847 },
    { familia: "Edamame", ym: "2025-01", valor: 1351.6584 },
    { familia: "Refeicoes e petiscos", ym: "2025-01", valor: 636.0835 },
    { familia: "Snack algas", ym: "2025-01", valor: 2784.3901 },
    { familia: "Snacks doces", ym: "2025-01", valor: 117.9242 },
    { familia: "Wakame", ym: "2025-01", valor: 100.2466 },
  ];
}

/** Hardcoded CPV_Boni product data for January 2025 */
function getExtraCpvBoniProductRows2025(): ProductApiRow[] {
  return [
    { produto: "FS - EDAMAME REPEAT 1KG X 10", ym: "2025-01", valor: 1044.6114 },
    { produto: "VA - BOLINHO DE ARROZ REPEAT 200g x 16", ym: "2025-01", valor: 125.8358 },
    { produto: "VA - BOLINHO DE COUVE FLOR REPEAT 200g x 16", ym: "2025-01", valor: 123.8895 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE 50g x 12", ym: "2025-01", valor: 58.524 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE, CARAMELO E FLOR DE SAL 50g x 12", ym: "2025-01", valor: 59.4002 },
    { produto: "VA - DADINHO DE TAPIOCA 250g x 16", ym: "2025-01", valor: 253.8891 },
    { produto: "VA - EDAMAME GRAOS REPEAT 300g x 18", ym: "2025-01", valor: 230.1454 },
    { produto: "VA - EDAMAME VAGEM REPEAT 300g x 18", ym: "2025-01", valor: 76.9017 },
    { produto: "VA - FALAFEL COM EDAMAME REPEAT 200g x 16", ym: "2025-01", valor: 132.4693 },
    { produto: "VA - MATCHA LATTE 150g x 12", ym: "2025-01", valor: 100.3847 },
    { produto: "VA - SNACK ALGA BARBECUE REPEAT 5G X 24", ym: "2025-01", valor: 366.7755 },
    { produto: "VA - SNACK ALGA ORIGINAL REPEAT 5G X 24", ym: "2025-01", valor: 2178.0074 },
    { produto: "VA - SNACK ALGA WASABI REPEAT 5G X 24", ym: "2025-01", valor: 239.6072 },
    { produto: "VA - WAKAME 125g X 21", ym: "2025-01", valor: 100.2466 },
  ];
}

/** Hardcoded CPV_Devol family data for January 2025 */
function getExtraCpvDevolFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Edamame", ym: "2025-01", valor: 3954.9436 },
    { familia: "Iguarias", ym: "2025-01", valor: 4954.7603 },
    { familia: "Refeicoes e petiscos", ym: "2025-01", valor: 125.8358 },
    { familia: "Snack algas", ym: "2025-01", valor: 975.5311 },
    { familia: "Temperos", ym: "2025-01", valor: 578.1909 },
    { familia: "Wakame", ym: "2025-01", valor: 100.2466 },
  ];
}

/** Hardcoded CPV_Devol product data for January 2025 */
function getExtraCpvDevolProductRows2025(): ProductApiRow[] {
  return [
    { produto: "FS - EDAMAME GRAOS (SOJA VERDE) REPEAT 1KG X 10", ym: "2025-01", valor: 1189.5804 },
    { produto: "FS - EDAMAME REPEAT 1KG X 10", ym: "2025-01", valor: 1833.4204 },
    { produto: "FS - SRIRACHA ORIGINAL 455g X 12", ym: "2025-01", valor: 320.7116 },
    { produto: "FS - UNAGI 5 KG", ym: "2025-01", valor: 3662.364 },
    { produto: "FS - YELLOWTAIL FILES", ym: "2025-01", valor: 1292.3963 },
    { produto: "VA - SRIRACHA MAYO 200g X 12", ym: "2025-01", valor: 89.6645 },
    { produto: "VA - BOLINHO DE ARROZ REPEAT 200g x 16", ym: "2025-01", valor: 125.8358 },
    { produto: "VA - EDAMAME GRAOS REPEAT 300g x 18", ym: "2025-01", valor: 306.8604 },
    { produto: "VA - EDAMAME VAGEM REPEAT 300g x 18", ym: "2025-01", valor: 625.0824 },
    { produto: "VA - SNACK ALGA BARBECUE REPEAT 5G X 24", ym: "2025-01", valor: 203.764 },
    { produto: "VA - SNACK ALGA ORIGINAL REPEAT 5G X 24", ym: "2025-01", valor: 492.2256 },
    { produto: "VA - SNACK ALGA WASABI REPEAT 5G X 24", ym: "2025-01", valor: 279.5415 },
    { produto: "VA - SRIRACHA ORIGINAL 200g X 24", ym: "2025-01", valor: 167.8148 },
    { produto: "VA - WAKAME 125g X 21", ym: "2025-01", valor: 100.2466 },
  ];
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const ym = p.get('ym') ?? '';
  const year = p.get('year') ?? (ym ? ym.slice(0, 4) : '');
  const kind = p.get('kind') ?? '';
  const breakdown = p.get('breakdown');

  if (breakdown === 'family') {
    if (!year) {
      return NextResponse.json({ error: 'missing year for family breakdown' }, { status: 400 });
    }
    if (kind === 'CPV' || kind === 'CPV_Boni' || kind === 'Perdas' || kind === 'CPV_Devol') {
      const rows = await fetchFamilyDetails(year, kind as FamilyKind);
      // Merge hardcoded CPV data for January 2025
      if (year === '2025' && kind === 'CPV') {
        for (const e of getExtraCpvFamilyRows2025()) {
          const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym);
          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push(e);
        }
      }
      // Merge hardcoded CPV_Boni data for January 2025
      if (year === '2025' && kind === 'CPV_Boni') {
        for (const e of getExtraCpvBoniFamilyRows2025()) {
          const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym);
          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push(e);
        }
      }
      // Merge hardcoded CPV_Devol data for January 2025
      if (year === '2025' && kind === 'CPV_Devol') {
        for (const e of getExtraCpvDevolFamilyRows2025()) {
          const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym);
          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push(e);
        }
      }
      return NextResponse.json(rows);
    } else {
      return NextResponse.json({ error: `Family breakdown not supported for COGS kind: ${kind}` }, { status: 400 });
    }
  }

  if (breakdown === 'product') {
    if (!year) {
      return NextResponse.json({ error: 'missing year for product breakdown' }, { status: 400 });
    }
    if (['CPV','CPV_Boni','Perdas','CPV_Devol'].includes(kind)) {
      const rows = await fetchProductDetails(year, kind as FamilyKind);
      // Merge hardcoded CPV product data for January 2025
      if (year === '2025' && kind === 'CPV') {
        for (const e of getExtraCpvProductRows2025()) {
          const idx = rows.findIndex(r =>
          normalizeProductLabel(r.produto) === normalizeProductLabel(e.produto) &&
          r.ym === e.ym
        );

          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push({ ...e, produto: normalizeProductLabel(e.produto) });

        }
      }
      // Merge hardcoded CPV_Boni product data for January 2025
      if (year === '2025' && kind === 'CPV_Boni') {
        for (const e of getExtraCpvBoniProductRows2025()) {
          const idx = rows.findIndex(r =>
          normalizeProductLabel(r.produto) === normalizeProductLabel(e.produto) &&
          r.ym === e.ym
        );

          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push({ ...e, produto: normalizeProductLabel(e.produto) });

        }
      }
      // Merge hardcoded CPV_Devol product data for January 2025
      if (year === '2025' && kind === 'CPV_Devol') {
        for (const e of getExtraCpvDevolProductRows2025()) {
          const idx = rows.findIndex(r =>
          normalizeProductLabel(r.produto) === normalizeProductLabel(e.produto) &&
          r.ym === e.ym
        );

          if (idx >= 0) rows[idx].valor += e.valor;
          else rows.push({ ...e, produto: normalizeProductLabel(e.produto) });

        }
      }
      return NextResponse.json(rows);
    }
    return NextResponse.json({ error: `Product breakdown not supported for kind: ${kind}` }, { status: 400 });
  }

  if (!/^[0-9]{4}-[0-9]{2}$/.test(ym) || !['CPV', 'CPV_Boni', 'Perdas', 'CPV_Devol'].includes(kind))
    return NextResponse.json({ error: 'bad params for COGS item details' }, { status: 400 });

  return NextResponse.json(await fetchCogsDetails(ym, kind as CogsKind));
} 