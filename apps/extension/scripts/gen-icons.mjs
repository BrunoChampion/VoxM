import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '..', 'public', 'icons');
const source = join(iconsDir, 'icon-source.png');
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  await sharp(source)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, `icon${size}.png`));
  console.log(`[icons] wrote icon${size}.png`);
}
