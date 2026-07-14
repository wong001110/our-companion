/**
 * Renderer-facing protocol for verified cached Network packs. The resolver
 * deliberately returns bytes, never a cache root or source path.
 */
export function handleNetworkAssetProtocolRequest(
  requestUrl: string,
  resolve: (assetPackId: string, relativePath: string) => { bytes: Buffer; mimeType: string },
): Response {
  try {
    if (/%2e|%2f|%5c/i.test(requestUrl)) return new Response('Invalid asset request', { status: 403 });
    const url = new URL(requestUrl);
    if (url.protocol !== 'companion-network:' || !url.hostname || !url.pathname.startsWith('/assets/')) return new Response('Invalid asset request', { status: 400 });
    const relativePath = url.pathname.slice(1);
    if (relativePath.includes('\\') || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) return new Response('Invalid asset request', { status: 403 });
    const result = resolve(url.hostname, relativePath);
    const body = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { 'Content-Type': result.mimeType } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
