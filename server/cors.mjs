// Origins of the app WebViews that call the API cross-origin with cookies.
// http://localhost is deliberately absent: with credentials enabled, any
// local dev server on the device could read signed-in responses.
export const ALLOWED_ORIGINS = Object.freeze([
  "https://appassets.androidplatform.net",
  "capacitor://localhost",
]);

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "content-type";
const PREFLIGHT_MAX_AGE_SEC = "600";

export function allowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

// Sets CORS headers on res (no wildcard; reflected origin; credentials).
// Returns true when the request was a preflight that has been fully answered.
export function applyCors(req, res) {
  res.setHeader("vary", "Origin");
  const origin = allowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
  }
  if (req.method !== "OPTIONS") return false;
  if (origin) {
    res.setHeader("access-control-allow-methods", ALLOWED_METHODS);
    res.setHeader("access-control-allow-headers", ALLOWED_HEADERS);
    res.setHeader("access-control-max-age", PREFLIGHT_MAX_AGE_SEC);
  }
  res.writeHead(204, { "cache-control": "no-store" });
  res.end();
  return true;
}
