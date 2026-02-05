import { NextResponse } from 'next/server'
import { fetchVolumeFamilyDetails, fetchVolumeProductDetails } from '@/lib/nfeVolume'
import type { FamilyApiRow } from '@/lib/nfeFamily'
import type { ProductApiRow } from '@/lib/nfeProduct'
import { normalizeProductLabel } from '@/lib/normalizeProductLabel'

/** Hardcoded volume family data for ReceitaBruta in January 2025 */
function getExtraVolumeFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Bebidas (CX)", ym: "2025-01", valor: 7 },
    { familia: "Edamame (CX)", ym: "2025-01", valor: 2427 },
    { familia: "Iguarias (KG)", ym: "2025-01", valor: 1282.251 },
    { familia: "Online", ym: "2025-01", valor: 0.1111 },
    { familia: "Refeicoes e petiscos (CX)", ym: "2025-01", valor: 102 },
    { familia: "Snack algas (CX)", ym: "2025-01", valor: 2151 },
    { familia: "Snacks doces (CX)", ym: "2025-01", valor: 98 },
    { familia: "Snacks salgados (CX)", ym: "2025-01", valor: 215 },
    { familia: "Temperos (CX)", ym: "2025-01", valor: 26.9167 },
    { familia: "Wakame (CX)", ym: "2025-01", valor: 259.3 },
  ]
}

/** Hardcoded volume family data for Devolucao in January 2025 */
function getExtraVolumeDevolucaoFamilyRows2025(): FamilyApiRow[] {
  return [
    { familia: "Edamame (CX)", ym: "2025-01", valor: 31 },
    { familia: "Iguarias (CX)", ym: "2025-01", valor: 23.7 },
    { familia: "Refeicoes e petiscos (CX)", ym: "2025-01", valor: 1 },
    { familia: "Snack algas (CX)", ym: "2025-01", valor: 24 },
    { familia: "Temperos (CX)", ym: "2025-01", valor: 4 },
    { familia: "Wakame (CX)", ym: "2025-01", valor: 1 },
  ];
}

/** Hardcoded volume product data for ReceitaBruta in January 2025 */
function getExtraVolumeProductRows2025(): ProductApiRow[] {
  return [
    { produto: "EDAMAME REPEAT 300G X 36 S/ SAL (CX)", ym: "2025-01", valor: 34 },
    { produto: "FS - BLACK COD HG (KG)", ym: "2025-01", valor: 198.836 },
    { produto: "FS - CAVALINHA MARINADA FILES (KG)", ym: "2025-01", valor: 62.665 },
    { produto: "FS - EDAMAME GRAOS (SOJA VERDE) REPEAT 1KG X 10 (CX)", ym: "2025-01", valor: 844 },
    { produto: "FS - EDAMAME REPEAT 1KG X 10 (CX)", ym: "2025-01", valor: 966 },
    { produto: "FS - OVAS DE MASSAGO - GREEN (KG)", ym: "2025-01", valor: 12.5 },
    { produto: "FS - OVAS DE MASSAGO - ORANGE (KG)", ym: "2025-01", valor: 172.5 },
    { produto: "FS - PASTA DE WASABI 200g (CX)", ym: "2025-01", valor: 0.4167 },
    { produto: "FS - PASTA DE WASABI 60 x 200g (CX)", ym: "2025-01", valor: 0.3333 },
    { produto: "FS - SRIRACHA ORIGINAL 455g X 12 (CX)", ym: "2025-01", valor: 16.1667 },
    { produto: "FS - UNAGI 5 KG (KG)", ym: "2025-01", valor: 29 },
    { produto: "FS - WAKAME 1,001 KG x 10 (CX)", ym: "2025-01", valor: 240.3 },
    { produto: "FS - YELLOWTAIL FILES (KG)", ym: "2025-01", valor: 806.75 },
    { produto: "VA - SRIRACHA MAYO 200g X 12 (CX)", ym: "2025-01", valor: 8 },
    { produto: "VA - BOLINHO DE ARROZ REPEAT 200g x 16 (CX)", ym: "2025-01", valor: 15 },
    { produto: "VA - BOLINHO DE COUVE FLOR REPEAT 200g x 16 (CX)", ym: "2025-01", valor: 21 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE 50g x 12 (CX)", ym: "2025-01", valor: 31 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC AO LEITE, CARAMELO E FLOR DE SAL 50g x 12 (CX)", ym: "2025-01", valor: 43 },
    { produto: "VA - CRISPY DE QUINOA COM CHOC MEIO AMARGO 50g x 12 (CX)", ym: "2025-01", valor: 24 },
    { produto: "VA - DADINHO DE TAPIOCA 250g x 16 (CX)", ym: "2025-01", valor: 29 },
    { produto: "VA - EDAMAME GRAOS REPEAT 300g x 18 (CX)", ym: "2025-01", valor: 274 },
    { produto: "VA - EDAMAME VAGEM REPEAT 300g x 18 (CX)", ym: "2025-01", valor: 309 },
    { produto: "VA - FALAFEL COM EDAMAME REPEAT 200g x 16 (CX)", ym: "2025-01", valor: 37 },
    { produto: "VA - MATCHA LATTE 150g x 12 (CX)", ym: "2025-01", valor: 7 },
    { produto: "VA - PARMESAO CROCANTE CEBOLA & SALSA 25g X 12 (CX)", ym: "2025-01", valor: 9 },
    { produto: "VA - PARMESAO CROCANTE ORIGINAL 25g x12 (CX)", ym: "2025-01", valor: 10 },
    { produto: "VA - SNACK ALGA BARBECUE REPEAT 5G X 24 (CX)", ym: "2025-01", valor: 303 },
    { produto: "VA - SNACK ALGA ORIGINAL REPEAT 5G X 24 (CX)", ym: "2025-01", valor: 1449 },
    { produto: "VA - SNACK ALGA WASABI REPEAT 5G X 24 (CX)", ym: "2025-01", valor: 399 },
    { produto: "VA - SNACK DE ARROZ CROCANTE QUEIJO 40g x 18 (CX)", ym: "2025-01", valor: 86 },
    { produto: "VA - SNACK DE ARROZ CROCANTE SHOYU 40g x 18 (CX)", ym: "2025-01", valor: 64 },
    { produto: "VA - SNACK DE ARROZ CROCANTE TOMATE 40g x 18 (CX)", ym: "2025-01", valor: 46 },
    { produto: "VA - SRIRACHA ORIGINAL 200g X 24 (CX)", ym: "2025-01", valor: 2 },
    { produto: "VA - WAKAME 125g X 21 (CX)", ym: "2025-01", valor: 19 },
  ]
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const year = p.get('year') ?? ''
  const kind = p.get('kind') as 'ReceitaBruta' | 'Devolucao'
  const breakdown = p.get('breakdown')

  if (!['ReceitaBruta','Devolucao'].includes(kind))
    return NextResponse.json({ error: 'unsupported kind' }, { status: 400 })

  if (breakdown === 'family') {
    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
    const rows = await fetchVolumeFamilyDetails(year, kind)
    if (year === '2025' && kind === 'ReceitaBruta') {
      for (const e of getExtraVolumeFamilyRows2025()) {
        const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym)
        if (idx >= 0) rows[idx].valor += e.valor
        else rows.push(e)
      }
    }
    if (year === '2025' && kind === 'Devolucao') {
      for (const e of getExtraVolumeDevolucaoFamilyRows2025()) {
        const idx = rows.findIndex(r => r.familia === e.familia && r.ym === e.ym)
        if (idx >= 0) rows[idx].valor += e.valor
        else rows.push(e)
      }
    }
    return NextResponse.json(rows)
  }

  if (breakdown === 'product') {
    if (!year) return NextResponse.json({ error: 'missing year' }, { status: 400 })
    const rows = await fetchVolumeProductDetails(year, kind)
    if (year === '2025' && kind === 'ReceitaBruta') {
      for (const e of getExtraVolumeProductRows2025()) {
        const idx = rows.findIndex(r =>
        normalizeProductLabel(r.produto) === normalizeProductLabel(e.produto) &&
        r.ym === e.ym
      );
        if (idx >= 0) rows[idx].valor += e.valor
        else rows.push({ ...e, produto: normalizeProductLabel(e.produto) });
      }
    }
    return NextResponse.json(rows)
  }

  return NextResponse.json({ error: 'bad params' }, { status: 400 })
} 