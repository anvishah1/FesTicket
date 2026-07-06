// Shared pagination parsing for dashboard list endpoints (ARCH-07).
//
// Accepts ?page (>= 1, default 1) and ?pageSize (1..100, default 50). `?limit`
// is honoured as an alias for pageSize so callers written against the older
// events-list convention keep working. Returns Prisma skip/take plus the
// normalised page/pageSize to echo back in the response.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function parsePagination(query = {}, opts = {}) {
  const defaultPageSize = opts.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = opts.maxPageSize ?? MAX_PAGE_SIZE;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawSize = parseInt(query.pageSize ?? query.limit, 10);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : defaultPageSize)
  );

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// Build the pagination object returned under `data`. Kept separate so every
// endpoint reports the same shape: { page, pageSize, total, totalPages }.
export function buildPagination(page, pageSize, total) {
  const safeTotal = Number(total) || 0;
  return {
    page,
    pageSize,
    total: safeTotal,
    totalPages: Math.ceil(safeTotal / pageSize),
  };
}
