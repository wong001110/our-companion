import fs from 'node:fs';
import {
  CompanionAssetPathError,
  getCompanionAssetMimeType,
  resolveCompanionAssetPath
} from './companionAssetPaths';

export interface CompanionProtocolOptions {
  userDataDir: string;
  companionExists: (companionId: string) => boolean;
}

export function handleCompanionProtocolRequest(requestUrl: string, options: CompanionProtocolOptions): Response {
  try {
    if (/%2e|%2f|%5c/i.test(requestUrl)) {
      return new Response('Invalid asset request', { status: 403 });
    }
    const url = new URL(requestUrl);
    if (url.protocol !== 'companion:') {
      return new Response('Malformed asset URL', { status: 400 });
    }
    const companionId = url.hostname;
    const relativePath = url.pathname.replace(/^\//, '');
    const mime = getCompanionAssetMimeType(relativePath);
    if (!mime) return new Response('Unsupported asset type', { status: 415 });

    const resolved = resolveCompanionAssetPath(
      { companionId, relativePath, mustExist: true },
      options
    );
    const stat = fs.lstatSync(resolved.target);
    if (!stat.isFile()) return new Response('Asset is not a file', { status: 403 });
    return new Response(fs.readFileSync(resolved.target), {
      headers: { 'Content-Type': mime },
    });
  } catch (error) {
    if (error instanceof CompanionAssetPathError) {
      const status = error.code === 'not_found' ? 404 :
        error.code === 'forbidden' ? 403 :
        error.code === 'unsupported' ? 415 :
        400;
      return new Response(status === 404 ? 'Not found' : 'Invalid asset request', { status });
    }
    if (error instanceof TypeError) return new Response('Malformed asset URL', { status: 400 });
    return new Response('Unable to read asset', { status: 500 });
  }
}
