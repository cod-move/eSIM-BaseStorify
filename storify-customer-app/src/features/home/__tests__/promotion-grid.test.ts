import type { MediaFrame, MediaRow } from '@/contracts/mobile/shop/v1';

import { firstFrames } from '../blocks/promotion-grid';

const frame = (id: string): MediaFrame => ({ id, slides: [] });
const ids = (rows: MediaRow[]) => rows.map((row) => row.columns.map((c) => c.map((f) => f.id)));

describe('firstFrames', () => {
  it('keeps the first four frames in reading order: row by row, column by column', () => {
    const rows: MediaRow[] = [
      { columns: [[frame('a')], [frame('b'), frame('c')]] },
      { columns: [[frame('d')]] },
      { columns: [[frame('e')], [frame('f')]] },
    ];

    expect(ids(firstFrames(rows, 4))).toEqual([[['a'], ['b', 'c']], [['d']]]);
  });

  it('cuts inside a column and drops the columns and rows left empty', () => {
    const rows: MediaRow[] = [
      {
        columns: [
          [frame('a'), frame('b'), frame('c')],
          [frame('d'), frame('e')],
        ],
      },
      { columns: [[frame('f')]] },
    ];

    expect(ids(firstFrames(rows, 4))).toEqual([[['a', 'b', 'c'], ['d']]]);
  });

  it('leaves a grid of four or fewer as it is', () => {
    const rows: MediaRow[] = [{ columns: [[frame('a')], [frame('b')]] }];

    expect(firstFrames(rows, 4)).toEqual(rows);
  });
});
