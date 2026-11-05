/** Origins that may call the Node API from a static Pages host (ACCESS_API_BASE). */

const DEFAULT_ORIGINS = [
  "https://gin1104.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function accessCorsOrigins(): string[] {
  const extra = (process.env.ACCESS_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allowed = accessCorsOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Base-Revision",
    "Access-Control-Expose-Headers": "X-Revision",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

export function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflight(request: Request): Response {
  return withCors(request, new Response(null, { status: 204 }));
}
