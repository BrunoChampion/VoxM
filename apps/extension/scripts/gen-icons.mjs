import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '..', 'public', 'icons');
const source = join(iconsDir, 'logo.svg');
const svg = readFileSync(source);
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  // Rasterize the SVG at each target size so corners stay transparent
  // and edges remain crisp (no upscaling artifacts).
  await sharp(svg, { density: Math.ceil((size / 128) * 384) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, `icon${size}.png`));
  console.log(`[icons] wrote icon${size}.png`);
}
