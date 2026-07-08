// Multer instances: files go to memory; sharp (images) or fs (PDF) writes
// the final artifact. fileFilter errors carry status 400 so the central
// error handler answers with JSON instead of an HTML 500.
const multer = require('multer');
const {
  UPLOAD_IMAGE_MAX_BYTES,
  UPLOAD_IMAGE_MAX_FILES,
  UPLOAD_PDF_MAX_BYTES,
} = require('../config');

function rejection(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_IMAGE_MAX_BYTES, files: UPLOAD_IMAGE_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) cb(null, true);
    else cb(rejection('Solo se permiten imágenes'));
  },
});

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_PDF_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(rejection('Solo se permite PDF'));
  },
});

module.exports = { imageUpload, pdfUpload };
