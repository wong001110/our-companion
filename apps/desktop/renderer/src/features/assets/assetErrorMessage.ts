import { t, type Lang } from '../../i18n';
import type { SpriteAssetError } from './useSpriteAssetStaging';

/** Converts validation details into the current renderer language at the UI boundary. */
export function formatSpriteAssetError(error: SpriteAssetError, lang: Lang): string {
  if (error.code === 'only_png') return t(lang, 'asset_error_only_png', { name: error.name });
  if (error.code === 'min_height') return t(lang, 'asset_error_min_height', { name: error.name, height: error.minImageHeight ?? 300 });
  return t(lang, 'asset_error_no_match', { name: error.name });
}
