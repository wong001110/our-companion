import { useEffect, useState } from 'react';

/** Shows the first square frame of a staged sprite sheet. */
export function SpritePreview({ dataUrl, alt = 'Staged sprite' }: { dataUrl: string; alt?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const frameSize = image.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = frameSize;
      canvas.height = frameSize;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(image, 0, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
      if (active) setSrc(canvas.toDataURL('image/png'));
    };
    image.src = dataUrl;
    return () => { active = false; };
  }, [dataUrl]);
  return src ? <img className="animation-preview-img" src={src} alt={alt} /> : <div className="animation-preview-placeholder" />;
}
