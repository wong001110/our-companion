import type { StagedSpriteAsset } from './useSpriteAssetStaging';
import { SpriteAssetSlot, type ExistingSpriteAsset } from './SpriteAssetSlot';

interface SpriteAssetGridProps {
  animationNames: readonly string[];
  stagedAssets: Record<string, StagedSpriteAsset>;
  existingAssets?: Record<string, ExistingSpriteAsset | undefined>;
  onStageFile: (animationName: string, file: File) => void;
  onRemoveStaged: (animationName: string) => void;
}

/** Stable asset-grid surface for both first-time creation and later editing. */
export function SpriteAssetGrid({
  animationNames,
  stagedAssets,
  existingAssets = {},
  onStageFile,
  onRemoveStaged,
}: SpriteAssetGridProps) {
  return (
    <div className="animation-grid">
      {animationNames.map((animationName) => (
        <SpriteAssetSlot
          key={animationName}
          animationName={animationName}
          staged={stagedAssets[animationName]}
          existing={existingAssets[animationName]}
          onStageFile={onStageFile}
          onRemoveStaged={onRemoveStaged}
        />
      ))}
    </div>
  );
}
