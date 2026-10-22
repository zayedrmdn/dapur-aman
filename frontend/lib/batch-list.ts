import type { Overview } from "./contracts";

export type BatchRow = Overview["packing_photos"][number];

function createdAt(row: BatchRow): number {
  const value = row.created_at ? Date.parse(row.created_at) : Number.NaN;
  return Number.isNaN(value) ? 0 : value;
}

/** Newest batch first. Rows without a creation time keep their original order at the end. */
export function newestFirst(rows: BatchRow[]): BatchRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const a = createdAt(left.row);
      const b = createdAt(right.row);
      if (a === b) return left.index - right.index;
      if (!a) return 1;
      if (!b) return -1;
      return b - a;
    })
    .map(item => item.row);
}

/** True when the row matches the search text on table name, school name or batch id. */
export function matchesSearch(row: BatchRow, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [row.table_name, row.school_name, row.batch_id].some(value => (value ?? "").toLowerCase().includes(text));
}

/** The rows that match the search text. */
export function matchingRows(rows: BatchRow[], query: string): BatchRow[] {
  return rows.filter(row => matchesSearch(row, query));
}

/** The picker options: the newest rows until a search runs, then up to `limit` matches. */
export function pickerRows(filtered: BatchRow[], query: string, recentCount: number, limit: number): BatchRow[] {
  return filtered.slice(0, query.trim() ? limit : recentCount);
}
