import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadToMinio, downloadFromMinio } from '../services/minio.service.js';
import { config } from '../config.js';

const router = Router();

// Configure Multer in-memory storage (max 10MB per file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, SVG) are allowed'));
    }
  },
});

function getBaseUrl(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

// Upload equipment image
router.post(
  '/equipment-image',
  upload.single('image') as any,
  async (req: Request, res: Response) => {
    /*  #swagger.tags = ['Uploads']
        #swagger.summary = 'Upload equipment image to MinIO'
        #swagger.consumes = ['multipart/form-data']
        #swagger.parameters['image'] = {
          in: 'formData',
          type: 'file',
          required: true,
          description: 'Image file for warehouse equipment'
        }
    */
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file uploaded' });
      }

      const baseUrl = getBaseUrl(req);
      const result = await uploadToMinio(config.minio.buckets.equipment, req.file, baseUrl, 'equipment');

      return res.status(201).json({
        success: true,
        message: 'Equipment image uploaded to MinIO successfully',
        data: result,
      });
    } catch (error: any) {
      console.error('Equipment image upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload equipment image to MinIO',
        error: error.message,
      });
    }
  }
);

// Upload user profile image
router.post(
  '/user-image',
  upload.single('image') as any,
  async (req: Request, res: Response) => {
    /*  #swagger.tags = ['Uploads']
        #swagger.summary = 'Upload user avatar/image to MinIO'
        #swagger.consumes = ['multipart/form-data']
        #swagger.parameters['image'] = {
          in: 'formData',
          type: 'file',
          required: true,
          description: 'Profile image for user'
        }
    */
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file uploaded' });
      }

      const baseUrl = getBaseUrl(req);
      const result = await uploadToMinio(config.minio.buckets.user, req.file, baseUrl, 'user');

      return res.status(201).json({
        success: true,
        message: 'User image uploaded to MinIO successfully',
        data: result,
      });
    } catch (error: any) {
      console.error('User image upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload user image to MinIO',
        error: error.message,
      });
    }
  }
);

// Stream / view image by bucket and fileName
router.get(
  '/view/:bucket/:fileName',
  async (req: Request, res: Response) => {
    /*  #swagger.tags = ['Uploads']
        #swagger.summary = 'View or stream image from MinIO'
        #swagger.parameters['bucket'] = {
          in: 'path',
          required: true,
          type: 'string',
          description: 'MinIO bucket name'
        }
        #swagger.parameters['fileName'] = {
          in: 'path',
          required: true,
          type: 'string',
          description: 'Object filename in bucket'
        }
    */
    try {
      const { bucket, fileName } = req.params;
      const { buffer, contentType } = await downloadFromMinio(bucket, fileName);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: 'Image not found in MinIO',
        error: error.message,
      });
    }
  }
);

// Convenience alias route when bucket is omitted (defaults to equipment bucket)
router.get(
  '/view/:fileName',
  async (req: Request, res: Response) => {
    /*  #swagger.tags = ['Uploads']
        #swagger.summary = 'View or stream equipment image from MinIO'
        #swagger.parameters['fileName'] = {
          in: 'path',
          required: true,
          type: 'string',
          description: 'Object filename in warehouse-equipment bucket'
        }
    */
    try {
      const { fileName } = req.params;
      const { buffer, contentType } = await downloadFromMinio(
        config.minio.buckets.equipment,
        fileName
      );

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: 'Image not found in MinIO',
        error: error.message,
      });
    }
  }
);

export default router;
