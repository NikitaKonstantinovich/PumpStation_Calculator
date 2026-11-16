/** The loopback server sits behind a TLS proxy that preserves the original Host.
 * Only the explicitly configured host gets the HTTPS origin; forwarded headers
 * are never used as authority for CSRF checks or generated links.
 */
export function withPublicOrigin(request: Request, configuredOrigin?: string): Request {
  if (!configuredOrigin) return request;
  const origin = new URL(configuredOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTPS origin");
  }
  const url = new URL(request.url);
  if (url.host !== origin.host) return request;
  url.protocol = origin.protocol;
  url.host = origin.host;
  return new Request(url, request);
}
