import { describe, expect, it } from 'vitest';
import { handleNetworkAssetProtocolRequest } from './networkAssetProtocol';

describe('companion-network protocol handler', () => {
  it('serves only resolver-approved verified Pack assets', async () => {
    const resolve = (assetPackId: string, relativePath: string) => {
      expect(assetPackId).toBe('pack-1');
      expect(relativePath).toBe('assets/animations/Idle_Neutral.png');
      return { bytes: Buffer.from('sprite'), mimeType: 'image/png' };
    };
    const response = handleNetworkAssetProtocolRequest('companion-network://pack-1/assets/animations/Idle_Neutral.png', resolve);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(await response.text()).toBe('sprite');
  });

  it('rejects traversal, malformed URLs, and resolver failures without revealing a local path', () => {
    const denied = () => { throw new Error('private cache root'); };
    expect(handleNetworkAssetProtocolRequest('companion-network://pack-1/assets/%2e%2e/secret.png', denied).status).toBe(403);
    expect(handleNetworkAssetProtocolRequest('companion-network://pack-1/not-assets/Idle_Neutral.png', denied).status).toBe(400);
    expect(handleNetworkAssetProtocolRequest('companion-network://unknown/assets/animations/Idle_Neutral.png', denied).status).toBe(404);
  });
});
