import type { MediaRow, PromotionGridBlock } from '@/contracts/mobile/shop/v1';

import { MediaRows } from '../slide';

/** On a phone the grid shows at most this many pictures; the rest belong to the website's wider grid. */
const PROMOTION_GRID_MAX = 4;

/**
 * The store's grid of promotion pictures, cut to its first `PROMOTION_GRID_MAX`
 * frames.
 */
export function PromotionGrid({ block }: { block: PromotionGridBlock }) {
  return <MediaRows rows={firstFrames(block.rows, PROMOTION_GRID_MAX)} />;
}

/**
 * The rows with only their first `max` frames, read row by row and column by
 * column as the grid draws them. A column or a row left with no frame is
 * dropped, so the grid never draws an empty cell.
 */
export function firstFrames(rows: MediaRow[], max: number): MediaRow[] {
  let left = max;
  const kept: MediaRow[] = [];
  for (const row of rows) {
    if (left <= 0) break;
    const columns = [];
    for (const column of row.columns) {
      if (left <= 0) break;
      const frames = column.slice(0, left);
      left -= frames.length;
      if (frames.length > 0) columns.push(frames);
    }
    if (columns.length > 0) kept.push({ ...row, columns });
  }
  return kept;
}
