export interface ExtraTaxRow {
  id: string;
  label: string;
  sign: '+' | '-';
  valor: number;
}

export const extraTax3Rows: ExtraTaxRow[] = [
  { id: 'tax3_Cofins_Venda',         label: 'Cofins',               sign: '+', valor: 10528.22 },
  { id: 'tax3_Cofins_Bonificacao',   label: 'Cofins Bonificacao',   sign: '+', valor:    51.98 },
  { id: 'tax3_Cofins_Devolucao',     label: 'Cofins Devolucao',     sign: '-', valor:  -288.8 },
  { id: 'tax3_FCP_Venda',            label: 'FCP',                  sign: '+', valor:  1303.62 },
  { id: 'tax3_FCP_Devolucao',        label: 'FCP Devolucao',        sign: '-', valor:   -39.77 },
  { id: 'tax3_ICMS_Venda',           label: 'ICMS',                 sign: '+', valor: 71440.41 },
  { id: 'tax3_ICMS_Bonificacao',     label: 'ICMS Bonificacao',     sign: '+', valor:  1346.17 },
  { id: 'tax3_ICMS_Devolucao',       label: 'ICMS Devolucao',       sign: '-', valor: -1659.36 },
  { id: 'tax3_PIS_Venda',            label: 'PIS',                  sign: '+', valor:  2281.03 },
  { id: 'tax3_PIS_Bonificacao',      label: 'PIS Bonificacao',      sign: '+', valor:    11.27 },
  { id: 'tax3_PIS_Devolucao',        label: 'PIS Devolucao',        sign: '-', valor:   -62.57 },
];

/** Hardcoded ST tax data for January 2025 */
export const extraTax4Rows: ExtraTaxRow[] = [
  { id: 'tax4_FCP_ST_Venda',        label: 'FCP_ST',                 sign: '+', valor:   200.87 },
  { id: 'tax4_ICMS_ST_Venda',       label: 'ICMS_ST',                sign: '+', valor: 10029.68 },
  { id: 'tax4_ICMS_ST_Devolucao',   label: 'ICMS_ST Devolucao',      sign: '+', valor:  -999.65 },
  { id: 'tax4_ICMS_ST_Bonificacao', label: 'ICMS_ST Bonificacao',    sign: '+', valor:    77.14 },
]; 