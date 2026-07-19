import { useEffect, useState } from 'react';

/** Plays a bounded preview of a staged horizontal sprite sheet. */
export function SpritePreview({ dataUrl, frameDurationMs, loop, alt = 'Staged sprite' }: {
  dataUrl: string;
  frameDurationMs: number;
  loop: boolean;
  alt?: string;
}) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const frameSize = image.naturalHeight;
      const frameCount = Math.max(1, Math.floor(image.naturalWidth / frameSize));
      const canvas = document.createElement('canvas');
      canvas.width = frameSize;
      canvas.height = frameSize;
      const context = canvas.getContext('2d');
      if (!context) return;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      let frame = 0;
      const render = () => {
        context.clearRect(0, 0, frameSize, frameSize);
        context.drawImage(image, frame * frameSize, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
        if (active) setSrc(canvas.toDataURL('image/png'));
        if (!active || reducedMotion || frameCount <= 1) return;
        if (!loop && frame >= frameCount - 1) return;
        frame = (frame + 1) % frameCount;
        timer = window.setTimeout(render, frameDurationMs);
      };
      render();
    };
    image.src = dataUrl;
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [dataUrl, frameDurationMs, loop]);
  return src ? <img className="animation-preview-img" src={src} alt={alt} /> : <div className="animation-preview-placeholder" />;
}
