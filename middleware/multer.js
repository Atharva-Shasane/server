const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// 1. Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Setup Cloudinary Storage engine for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'killa_resto_menu', // The folder name in your Cloudinary dashboard
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }], // Optional: Auto-resize for CDN optimization
  },
});

// 3. Initialize Multer with the Cloudinary storage
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Limit file size to 5MB
});

module.exports = upload;