export function normalizeProductLabel(s: string): string {
  return (s ?? '')
    .normalize('NFKC')
    .replace(/^\s*(FS|VA)\s*-\s*/i, '')        // remove FS - / VA -
    .replace(/\s*\((CX|KG|UN)\)\s*$/i, '')     // remove (CX)/(KG)/(UN) no final
    .replace(/\s+/g, ' ')                      // normaliza espaços
    .trim();
}
