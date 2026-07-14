import { useRef, type ReactNode } from 'react';
import type { StagedSpriteAsset } from './useSpriteAssetStaging';
import { SpritePreview } from './SpritePreview';
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

export interface ExistingSpriteAsset {
  preview: ReactNode;
  detail?: string;
  remove?: () => void;
}

interface SpriteAssetSlotProps {
  animationName: string;
  staged?: StagedSpriteAsset;
  existing?: ExistingSpriteAsset;
  onStageFile: (animationName: string, file: File) => void;
  onRemoveStaged: (animationName: string) => void;
}

/** A single animation upload target shared by Companion creation and editing. */
export function SpriteAssetSlot({
  animationName,
  staged,
  existing,
  onStageFile,
  onRemoveStaged,
}: SpriteAssetSlotProps) {
  const lang = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAsset = Boolean(staged || existing);
  const selectFile = () => inputRef.current?.click();

  return (
    <div className={`animation-slot ${hasAsset ? 'animation-slot-filled' : ''}`} data-motion-state={hasAsset ? 'entered' : 'exited'}>
      {staged ? <SpritePreview dataUrl={staged.dataUrl} alt={t(lang, 'asset_upload_label', { name: animationName })} /> : existing?.preview}
      <div className="animation-slot-header">
        <span className="animation-slot-name">
          {hasAsset && <span className="animation-slot-check" aria-label={t(lang, 'asset_uploaded')}>✓</span>}
          {animationName}
        </span>
        {staged && <span className="animation-slot-staged">{t(lang, 'asset_staged')}</span>}
        {!staged && existing?.detail && <span className="animation-slot-size">{existing.detail}</span>}
      </div>
      <div className="animation-slot-actions">
        <input
          ref={inputRef}
          type="file"
          accept=".png"
          className="visually-hidden"
          aria-label={t(lang, 'asset_upload_label', { name: animationName })}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onStageFile(animationName, file);
          }}
        />
        {staged ? (
          <>
            <button className="btn-secondary btn-sm" onClick={selectFile}>{t(lang, 'asset_replace')}</button>
            <button className="btn-ghost btn-sm" onClick={() => onRemoveStaged(animationName)}>{t(lang, 'asset_remove')}</button>
          </>
        ) : existing ? (
          <>
            <button className="btn-secondary btn-sm" onClick={selectFile}>{t(lang, 'asset_replace')}</button>
            {existing.remove && <button className="btn-ghost btn-sm" onClick={existing.remove}>{t(lang, 'asset_remove')}</button>}
          </>
        ) : (
          <button className="btn-secondary btn-sm" onClick={selectFile}>{t(lang, 'asset_upload')}</button>
        )}
      </div>
    </div>
  );
}
