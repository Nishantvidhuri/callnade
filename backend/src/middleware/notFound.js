export function notFound(req, res, _next) {
  res.status(404).json({ error: { message: `Not found: ${req.method} ${req.originalUrl}` } });
}
