// Local Miniflare transport uses the same Node HTTP client as check-ai-connection.
// This service binding is internal; it is not an HTTP route exposed to browsers.
export async function localAIProvider(request) {
  if (request.url !== "https://api.openai.com/v1/responses" || request.method !== "POST") return new Response(null, { status: 403 });
  try {
    return await fetch(request.url, {
      method: "POST", redirect: "manual",
      headers: { Authorization: request.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
      body: await request.arrayBuffer(),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
    });
  } catch { return new Response(null, { status: 502 }); }
}
