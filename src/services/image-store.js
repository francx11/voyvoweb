// One image pipeline for every uploader (galería, carta, ofertas, pizza del
// mes). They all want the same thing: EXIF-rotated, capped to
// IMAGE_MAX_DIMENSION and re-encoded to WebP, so a 6 MB foto del móvil ends
// up as ~150 KB. Having it in four places meant four chances to forget
// .rotate() and publish a photo on its side.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { IMAGE_MAX_DIMENSION, IMAGE_WEBP_QUALITY } = require('../config');

// Random suffix, not just the timestamp: two photos uploaded in the same
// millisecond (multi-file gallery upload) would otherwise overwrite each other.
const newName = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;

// Writes `buffer` into `dir` and returns the filename it chose.
async function saveWebp(buffer, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const name = newName();
  await sharp(buffer)
    .rotate() // respects EXIF orientation
    .resize({
      width: IMAGE_MAX_DIMENSION,
      height: IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_WEBP_QUALITY })
    .toFile(path.join(dir, name));
  return name;
}

// Deletes the file a stored URL points at. basename() keeps a crafted
// "../../data/auth.json" from escaping the image directory; a missing file is
// not an error, since the JSON is the source of truth and disk can lag it.
function removeImage(dir, image) {
  if (!image) return;
  const fp = path.join(dir, path.basename(image));
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

module.exports = { saveWebp, removeImage };
