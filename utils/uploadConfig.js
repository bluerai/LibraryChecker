import multer from 'multer';

export default multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' ||
      file.mimetype === 'text/html' ||
      file.originalname.endsWith('.json') ||
      file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(new Error('Nur JSON- oder HTML-Dateien erlaubt'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});