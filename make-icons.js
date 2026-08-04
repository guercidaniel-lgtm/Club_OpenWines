const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, 'public/assets/logo-color.png');
const OUT_DIR = path.join(__dirname, 'public/icons');
const LIGHT_GRAY = { r: 245, g: 245, b: 245, alpha: 1 };

async function run() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const rowAlpha = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += data[(y * width + x) * channels + 3];
    }
    rowAlpha[y] = sum;
  }

  let seenContent = false;
  let gapStart = null;
  const threshold = 255 * width * 0.01;
  for (let y = 0; y < height; y++) {
    if (!seenContent && rowAlpha[y] > threshold) seenContent = true;
    if (seenContent && rowAlpha[y] <= threshold) {
      const lookahead = rowAlpha.slice(y, Math.min(y + 15, height));
      if (lookahead.every((v) => v <= threshold)) { gapStart = y; break; }
    }
  }
  if (!gapStart) throw new Error('No se encontró el límite botella/texto');
  console.log('bottle bottom row:', gapStart, 'of', height);

  const bottleBuf = await sharp(SRC)
    .extract({ left: 0, top: 0, width, height: gapStart })
    .trim()
    .png()
    .toBuffer();
  const bottleMeta = await sharp(bottleBuf).metadata();
  console.log('bottle trimmed size:', bottleMeta.width, bottleMeta.height);

  async function makeIcon(size, filename) {
    const innerSize = Math.round(size * 0.62);
    const resizedBottle = await sharp(bottleBuf)
      .resize({ width: innerSize, height: innerSize, fit: 'inside' })
      .toBuffer();
    const resizedMeta = await sharp(resizedBottle).metadata();
    const left = Math.round((size - resizedMeta.width) / 2);
    const top = Math.round((size - resizedMeta.height) / 2);

    await sharp({ create: { width: size, height: size, channels: 4, background: LIGHT_GRAY } })
      .composite([{ input: resizedBottle, left, top }])
      .png()
      .toFile(path.join(OUT_DIR, filename));
    console.log('wrote', filename);
  }

  await makeIcon(512, 'icon-512.png');
  await makeIcon(192, 'icon-192.png');
  await makeIcon(180, 'apple-touch-icon.png');
}

run().catch((e) => { console.error(e); process.exit(1); });
