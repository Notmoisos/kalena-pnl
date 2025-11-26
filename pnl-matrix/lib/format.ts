export const fmtPlainBR = (v: number) =>
  Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(v)); 