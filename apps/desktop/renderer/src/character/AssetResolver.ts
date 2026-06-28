export class AssetResolver {
  private readonly root: string;

  constructor(assetRoot: string) {
    this.root = assetRoot.replace(/\/$/, '');
  }

  animation(name: string): string {
    return `${this.root}/animations/${name}.png`;
  }

  portrait(name: string): string {
    return `${this.root}/portraits/${name}.png`;
  }

  icon(name: string): string {
    return `${this.root}/icons/${name}.png`;
  }

  voice(name: string): string {
    return `${this.root}/voices/${name}.mp3`;
  }

  emotion(name: string): string {
    return `${this.root}/emotions/${name}.png`;
  }

  get rootPath(): string {
    return this.root;
  }
}

export const DEFAULT_ASSET_ROOT = 'assets/companions/ann';
