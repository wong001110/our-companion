import type { StagedSpriteAsset } from './useSpriteAssetStaging';
import type { CompanionAnimationManifestEntry } from '@our-companion/shared';
import { SpriteAssetSlot, type ExistingSpriteAsset } from './SpriteAssetSlot';

interface SpriteAssetGridProps {
  animationManifest: readonly CompanionAnimationManifestEntry[];
  stagedAssets: Record<string, StagedSpriteAsset>;
  existingAssets?: Record<string, ExistingSpriteAsset | undefined>;
  onStageFile: (animationName: string, file: File) => void;
  onRemoveStaged: (animationName: string) => void;
}

/** Stable asset-grid surface for both first-time creation and later editing. */
export function SpriteAssetGrid({
  animationManifest,
  stagedAssets,
  existingAssets = {},
  onStageFile,
  onRemoveStaged,
}: SpriteAssetGridProps) {
  return (
    <div className="animation-grid">
      {animationManifest.map((definition) => (
        <SpriteAssetSlot
          key={definition.key}
          definition={definition}
          staged={stagedAssets[definition.key]}
          existing={existingAssets[definition.key]}
          onStageFile={onStageFile}
          onRemoveStaged={onRemoveStaged}
        />
      ))}
    </div>
  );
}
