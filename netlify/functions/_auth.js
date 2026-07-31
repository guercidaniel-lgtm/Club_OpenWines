function requireAdmin(event) {
  const headers = event.headers || {};
  const key = headers['x-admin-key'] || headers['X-Admin-Key'];
  return Boolean(key) && Boolean(process.env.ADMIN_KEY) && key === process.env.ADMIN_KEY;
}

module.exports = { requireAdmin };
