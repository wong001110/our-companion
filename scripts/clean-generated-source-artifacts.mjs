import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = [
  path.join(projectRoot, 'apps', 'desktop', 'electron'),
  path.join(projectRoot, 'apps', 'desktop', 'renderer', 'src'),
  path.join(projectRoot, 'packages'),
];

function sourceExistsFor(artifactPath) {
  const extension = path.extname(artifactPath);
  const basePath = extension === '.js'
    ? artifactPath.slice(0, -'.js'.length)
    : artifactPath.slice(0, -'.d.ts'.length);

  return ['.ts', '.tsx'].some((sourceExtension) => existsSync(`${basePath}${sourceExtension}`));
}

function removeGeneratedArtifacts(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeGeneratedArtifacts(entryPath);
      continue;
    }

    if (!entry.isFile() || (!entry.name.endsWith('.js') && !entry.name.endsWith('.d.ts'))) continue;
    if (!sourceExistsFor(entryPath)) continue;

    rmSync(entryPath);
    console.log(`Removed generated source artifact: ${path.relative(projectRoot, entryPath)}`);
  }
}

for (const sourceRoot of sourceRoots) removeGeneratedArtifacts(sourceRoot);
