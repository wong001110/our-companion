export function matchingAnimationName(fileName: string, animationNames: readonly string[]): string | undefined {
  const normalised = fileName.replace(/\.[^.]+$/, '').replace(/[- ]/g, '_').toLowerCase();
  return animationNames.find((animation) => animation.toLowerCase() === normalised);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function getSpriteImageHeight(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalHeight);
    image.onerror = () => resolve(0);
    image.src = dataUrl;
  });
}
