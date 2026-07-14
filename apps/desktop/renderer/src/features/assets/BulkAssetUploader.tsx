interface BulkAssetUploaderProps {
  onUpload: () => void;
}

/** Uses the desktop file picker while keeping bulk upload wording and behavior consistent. */
export function BulkAssetUploader({ onUpload }: BulkAssetUploaderProps) {
  const lang = useLang();
  return (
    <div className="animation-bulk-row">
      <button className="btn-secondary btn-sm" onClick={onUpload}>{t(lang, 'asset_bulk_upload')}</button>
      <span className="animation-bulk-hint">{t(lang, 'asset_bulk_upload_hint')}</span>
    </div>
  );
}
import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';
