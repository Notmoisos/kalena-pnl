import { utils, writeFileXLSX, WritingOptions } from 'xlsx';
import { PnLNode, Month } from './pnlLogic';
import { fmtPlainBR } from './format';

export interface ExportColumn {
  key: string;
  header: string;
  hidden?: boolean;
}

export function toMatrix(rows: Record<string, any>[], cols: ExportColumn[]) {
  const visible = cols.filter(c => !c.hidden);
  return [
    visible.map(c => c.header),
    ...rows.map(r => visible.map(c => r[c.key])),
  ];
}

export function exportToExcel(
  matrix: any[][],
  opts?: { fileName?: string; writeOptions?: WritingOptions }
): void;
export function exportToExcel(
  rows: Record<string, any>[],
  cols: ExportColumn[],
  opts?: { fileName?: string; writeOptions?: WritingOptions }
): void;
export function exportToExcel(
  arg1: any,
  arg2?: any,
  arg3?: any
) {
  let matrix: any[][];
  let opts: { fileName?: string; writeOptions?: WritingOptions } = {};
  if (Array.isArray(arg1) && Array.isArray(arg1[0])) {
    matrix = arg1;
    opts = arg2 || {};
  } else {
    matrix = toMatrix(arg1, arg2);
    opts = arg3 || {};
  }
  const ws = utils.aoa_to_sheet(matrix);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'PnL');
  const ts = new Date().toISOString().replace(/[T:]/g, '-').slice(0, 16);
  writeFileXLSX(wb, opts.fileName || `PNL_${ts}.xlsx`, {
    compression: true,
    ...opts.writeOptions,
  });
} 