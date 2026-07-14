import { useCallback, useMemo, useState } from 'react';
import { dataUrlToBlob, getSpriteImageHeight, matchingAnimationName, readFileAsDataUrl } from './spriteAssetValidation';

export interface StagedSpriteAsset { file: File; dataUrl: string; }
export interface SpriteAssetError {
  code: 'only_png' | 'min_height' | 'no_match';
  name: string;
  minImageHeight?: number;
}

export function useSpriteAssetStaging({ animationManifest, existingAssets = {}, minImageHeight = 300 }: {
  animationManifest: readonly string[];
  existingAssets?: Record<string, unknown>;
  minImageHeight?: number;
}) {
  const [stagedAssets, setStagedAssets] = useState<Record<string, StagedSpriteAsset>>({});
  const [errors, setErrors] = useState<SpriteAssetError[]>([]);
  const missingRequired = useMemo(() => animationManifest.filter((name) => !stagedAssets[name] && !existingAssets[name]), [animationManifest, stagedAssets, existingAssets]);

  const stageFile = useCallback(async (animationName: string, file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.png')) { setErrors([{ code: 'only_png', name: file.name }]); return false; }
    const dataUrl = await readFileAsDataUrl(file);
    const height = await getSpriteImageHeight(dataUrl);
    if (height < minImageHeight) { setErrors([{ code: 'min_height', name: file.name, minImageHeight }]); return false; }
    setStagedAssets((current) => ({ ...current, [animationName]: { file, dataUrl } }));
    setErrors([]);
    return true;
  }, [minImageHeight]);

  const stageBulkFiles = useCallback(async (files: Array<{ name: string; dataUrl: string }>) => {
    const nextErrors: SpriteAssetError[] = [];
    const next: Record<string, StagedSpriteAsset> = {};
    for (const item of files) {
      const animationName = matchingAnimationName(item.name, animationManifest);
      if (!animationName) { nextErrors.push({ code: 'no_match', name: item.name }); continue; }
      if (await getSpriteImageHeight(item.dataUrl) < minImageHeight) { nextErrors.push({ code: 'min_height', name: item.name, minImageHeight }); continue; }
      next[animationName] = { file: new File([dataUrlToBlob(item.dataUrl)], item.name, { type: 'image/png' }), dataUrl: item.dataUrl };
    }
    if (Object.keys(next).length) setStagedAssets((current) => ({ ...current, ...next }));
    setErrors(nextErrors);
    return Object.keys(next).length;
  }, [animationManifest, minImageHeight]);

  const removeStaged = useCallback((animationName: string) => setStagedAssets((current) => { const next = { ...current }; delete next[animationName]; return next; }), []);
  const clear = useCallback(() => { setStagedAssets({}); setErrors([]); }, []);
  return { stagedAssets, missingRequired, errors, stageFile, stageBulkFiles, removeStaged, clear };
}
