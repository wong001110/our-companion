import { useCallback, useMemo, useState } from 'react';
import type { CompanionAnimationManifestEntry } from '@our-companion/shared';
import { dataUrlToBlob, getSpriteImageDimensions, matchingAnimationName, readFileAsDataUrl } from './spriteAssetValidation';

export interface StagedSpriteAsset {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  frameCount: number;
}
export interface SpriteAssetError {
  code: 'only_png' | 'invalid_image' | 'frame_size' | 'sheet_width' | 'frame_count' | 'duplicate' | 'no_match';
  name: string;
  animationKey?: string;
  minimum?: number;
  maximum?: number;
}

export function useSpriteAssetStaging({ animationManifest, existingAssets = {} }: {
  animationManifest: readonly CompanionAnimationManifestEntry[];
  existingAssets?: Record<string, unknown>;
}) {
  const [stagedAssets, setStagedAssets] = useState<Record<string, StagedSpriteAsset>>({});
  const [errors, setErrors] = useState<SpriteAssetError[]>([]);
  const animationNames = useMemo(() => animationManifest.map((entry) => entry.key), [animationManifest]);
  const definitions = useMemo(
    () => new Map(animationManifest.map((entry) => [entry.key, entry])),
    [animationManifest],
  );
  const missingRequired = useMemo(
    () => animationManifest
      .filter((entry) => entry.requiredForCreation && !stagedAssets[entry.key] && !existingAssets[entry.key])
      .map((entry) => entry.key),
    [animationManifest, stagedAssets, existingAssets],
  );

  const validate = useCallback(async (
    animationName: string,
    name: string,
    dataUrl: string,
  ): Promise<StagedSpriteAsset | SpriteAssetError> => {
    const definition = definitions.get(animationName as CompanionAnimationManifestEntry['key']);
    if (!definition) return { code: 'no_match', name };
    const { width, height } = await getSpriteImageDimensions(dataUrl);
    if (!width || !height) return { code: 'invalid_image', name, animationKey: animationName };
    if (height < definition.minFrameSize || height > definition.maxFrameSize) {
      return {
        code: 'frame_size',
        name,
        animationKey: animationName,
        minimum: definition.minFrameSize,
        maximum: definition.maxFrameSize,
      };
    }
    if (width % height !== 0) {
      return { code: 'sheet_width', name, animationKey: animationName };
    }
    const frameCount = width / height;
    if (frameCount < definition.minFrames || frameCount > definition.maxFrames) {
      return {
        code: 'frame_count',
        name,
        animationKey: animationName,
        minimum: definition.minFrames,
        maximum: definition.maxFrames,
      };
    }
    return {
      file: new File([dataUrlToBlob(dataUrl)], name, { type: 'image/png' }),
      dataUrl,
      width,
      height,
      frameCount,
    };
  }, [definitions]);

  const stageFile = useCallback(async (animationName: string, file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.png')) { setErrors([{ code: 'only_png', name: file.name }]); return false; }
    const dataUrl = await readFileAsDataUrl(file);
    const validated = await validate(animationName, file.name, dataUrl);
    if ('code' in validated) { setErrors([validated]); return false; }
    setStagedAssets((current) => ({
      ...current,
      [animationName]: { ...validated, file },
    }));
    setErrors([]);
    return true;
  }, [validate]);

  const stageBulkFiles = useCallback(async (files: Array<{ name: string; dataUrl: string }>) => {
    const nextErrors: SpriteAssetError[] = [];
    const next: Record<string, StagedSpriteAsset> = {};
    for (const item of files) {
      const animationName = matchingAnimationName(item.name, animationNames);
      if (!animationName) { nextErrors.push({ code: 'no_match', name: item.name }); continue; }
      if (next[animationName]) {
        nextErrors.push({ code: 'duplicate', name: item.name, animationKey: animationName });
        continue;
      }
      if (!item.name.toLowerCase().endsWith('.png')) {
        nextErrors.push({ code: 'only_png', name: item.name, animationKey: animationName });
        continue;
      }
      const validated = await validate(animationName, item.name, item.dataUrl);
      if ('code' in validated) {
        nextErrors.push(validated);
        continue;
      }
      next[animationName] = validated;
    }
    if (Object.keys(next).length) setStagedAssets((current) => ({ ...current, ...next }));
    setErrors(nextErrors);
    return Object.keys(next);
  }, [animationNames, validate]);

  const removeStaged = useCallback((animationName: string) => setStagedAssets((current) => { const next = { ...current }; delete next[animationName]; return next; }), []);
  const clear = useCallback(() => { setStagedAssets({}); setErrors([]); }, []);
  return { stagedAssets, missingRequired, errors, stageFile, stageBulkFiles, removeStaged, clear };
}
