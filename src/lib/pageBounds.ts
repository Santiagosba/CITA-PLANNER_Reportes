export function pageBounds(total: number, requested: number, size = 50) {
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.max(0, Math.min(Math.floor(requested), pages - 1))
  const start = page * size
  return { page, pages, size, start, end: Math.min(total, start + size) }
}
