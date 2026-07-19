import { t, type Lang } from '../../i18n';
import type { SpriteAssetError } from './useSpriteAssetStaging';

/** Converts validation details into the current renderer language at the UI boundary. */
export function formatSpriteAssetError(error: SpriteAssetError, lang: Lang): string {
  if (error.code === 'only_png') return t(lang, 'asset_error_only_png', { name: error.name });
  if (error.code === 'invalid_image') return t(lang, 'asset_error_invalid_image', { name: error.name });
  if (error.code === 'frame_size') return t(lang, 'asset_error_frame_size', { name: error.name, min: error.minimum ?? 300, max: error.maximum ?? 4096 });
  if (error.code === 'sheet_width') return t(lang, 'asset_error_sheet_width', { name: error.name });
  if (error.code === 'frame_count') return t(lang, 'asset_error_frame_count', { name: error.name, min: error.minimum ?? 1, max: error.maximum ?? 120 });
  if (error.code === 'duplicate') return t(lang, 'asset_error_duplicate', { name: error.name, animation: error.animationKey ?? '' });
  return t(lang, 'asset_error_no_match', { name: error.name });
}
