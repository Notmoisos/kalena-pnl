import { toMatrix, ExportColumn } from './exportToExcel';

describe('toMatrix', () => {
  it('should transform rows and columns to 2D array', () => {
    const cols: ExportColumn[] = [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
    ];
    const rows = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ];
    expect(toMatrix(rows, cols)).toEqual([
      ['A', 'B'],
      [1, 2],
      [3, 4],
    ]);
  });

  it('should skip hidden columns', () => {
    const cols: ExportColumn[] = [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B', hidden: true },
    ];
    const rows = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ];
    expect(toMatrix(rows, cols)).toEqual([
      ['A'],
      [1],
      [3],
    ]);
  });
}); 