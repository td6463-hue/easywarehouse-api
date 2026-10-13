import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { config } from '../config.js';

let cachedTokenCookie: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Authenticate with the MinIO Console to obtain a session token cookie
 */
async function getMinioSessionCookie(forceRefresh = false): Promise<string> {
  const now = Date.now();
  // Reuse valid session if not expired (tokens usually last 12 hours)
  if (!forceRefresh && cachedTokenCookie && now < tokenExpiresAt) {
    return cachedTokenCookie;
  }

  const baseUrl = config.minio.publicUrl.replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/api/v1/login`;

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `MinIO Console authentication failed (HTTP ${response.status}): ${errorBody || response.statusText}`
    );
  }

  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('MinIO Console login succeeded but no session cookie was returned.');
  }

  const match = setCookie.match(/token=[^;]+/);
  if (!match) {
    throw new Error('Could not parse token cookie from MinIO Console login response.');
  }

  cachedTokenCookie = match[0];
  // Cache for 10 hours
  tokenExpiresAt = now + 10 * 60 * 60 * 1000;
  return cachedTokenCookie;
}

/**
 * Whitelist of safe image file extensions.
 * Prevents arbitrary file execution or server-side script inclusion.
 */
const SAFE_IMAGE_EXTENSIONS: Record<string, string> = {
  '.jpg': '.jpg',
  '.jpeg': '.jpeg',
  '.png': '.png',
  '.webp': '.webp',
  '.gif': '.gif',
  '.svg': '.svg',
};

/**
 * Generate a cryptographically secure, non-guessable file name for uploads.
 * Discards any user-supplied or hacker file name to prevent:
 * 1. Directory traversal (e.g. ../../malware.php)
 * 2. Shell execution (e.g. c99.php, test.sh)
 * 3. Malware tracking (hacker cannot locate or find the uploaded file on the server)
 */
export function generateSecureFilename(originalName: string, prefix = 'file'): string {
  const rawExt = path.extname(originalName || '').toLowerCase();
  const safeExt = SAFE_IMAGE_EXTENSIONS[rawExt] || '.jpg';
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanPrefix}_${uuidv4()}${safeExt}`;
}

/**
 * Extract pure file name from a potential full URL or relative path.
 * If given "http://127.0.0.1:3000/api/v1/upload/view/warehouse-equipment/abc.jpg",
 * it returns "abc.jpg".
 */
export function sanitizeImageFilename(val: string | null | undefined): string | null {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      return path.basename(parsed.pathname);
    }
  } catch (_) {}

  return path.basename(trimmed);
}

/**
 * Generate the public view URL for an image stored on MinIO
 * Given a filename and bucket, returns the URL to fetch/display the image.
 */
export function getFileUrl(
  fileName: string | null | undefined,
  bucketName: string = config.minio.buckets.equipment,
  req?: Request | { headers?: Record<string, any>; protocol?: string; get?: (header: string) => string | undefined }
): string | null {
  if (!fileName) return null;
  const cleanName = sanitizeImageFilename(fileName);
  if (!cleanName) return null;

  let baseUrl = 'http://localhost:3000';
  if (req) {
    const protocol = (req.headers && req.headers['x-forwarded-proto']) || req.protocol || 'http';
    const host =
      (req.headers && req.headers['x-forwarded-host']) ||
      (typeof req.get === 'function' ? req.get('host') : null) ||
      'localhost:3000';
    baseUrl = `${protocol}://${host}`;
  }

  return `${baseUrl.replace(/\/+$/, '')}/api/v1/upload/view/${encodeURIComponent(
    bucketName
  )}/${encodeURIComponent(cleanName)}`;
}

export interface UploadResult {
  fileName: string;
  originalName: string;
  url: string;
  minioBrowserUrl: string;
  bucket: string;
  size: number;
  mimeType: string;
}

/**
 * Upload a file securely to MinIO bucket
 * @param bucketName Name of target bucket ('warehouse-equipment' or 'warehouse-user')
 * @param file Express Multer file object
 * @param baseUrl Base URL of the API server (for generating publicly accessible view URL)
 * @param prefix Category prefix for generated file name ('equipment' or 'user')
 */
export async function uploadToMinio(
  bucketName: string,
  file: Express.Multer.File,
  baseUrl = 'http://localhost:3000',
  prefix = 'equipment'
): Promise<UploadResult> {
  // Generate safe, unguessable filename for security
  const fileName = generateSecureFilename(file.originalname, prefix);
  const fileSize = file.size;

  const minioBase = config.minio.publicUrl.replace(/\/+$/, '');
  const uploadUrl = `${minioBase}/api/v1/buckets/${encodeURIComponent(
    bucketName
  )}/objects/upload?prefix=${encodeURIComponent(fileName)}`;

  // Construct FormData: MinIO Console requires the field name to be the file size as a string
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
  formData.append(fileSize.toString(), blob, fileName);

  async function executeUpload(tokenCookie: string) {
    return await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Cookie: tokenCookie,
      },
      body: formData,
    });
  }

  let cookie = await getMinioSessionCookie();
  let uploadRes = await executeUpload(cookie);

  // If token expired, refresh once and retry
  if (uploadRes.status === 401 || uploadRes.status === 403) {
    cookie = await getMinioSessionCookie(true);
    uploadRes = await executeUpload(cookie);
  }

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text().catch(() => '');
    throw new Error(
      `MinIO upload failed (HTTP ${uploadRes.status}): ${errorText || uploadRes.statusText}`
    );
  }

  // Generate public view URL served via our API's streaming proxy
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const publicViewUrl = `${cleanBase}/api/v1/upload/view/${encodeURIComponent(
    bucketName
  )}/${encodeURIComponent(fileName)}`;
  const minioBrowserUrl = `${minioBase}/browser/${encodeURIComponent(bucketName)}`;

  return {
    fileName,
    originalName: file.originalname,
    url: publicViewUrl,
    minioBrowserUrl,
    bucket: bucketName,
    size: fileSize,
    mimeType: file.mimetype,
  };
}

/**
 * Fetch an object stream/buffer from MinIO bucket
 * @param bucketName Name of bucket
 * @param fileName File name in bucket
 */
export async function downloadFromMinio(
  bucketName: string,
  fileName: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const cleanName = sanitizeImageFilename(fileName);
  if (!cleanName) {
    throw new Error('Invalid file name specified.');
  }

  const minioBase = config.minio.publicUrl.replace(/\/+$/, '');
  const downloadUrl = `${minioBase}/api/v1/buckets/${encodeURIComponent(
    bucketName
  )}/objects/download?prefix=${encodeURIComponent(cleanName)}`;

  let cookie = await getMinioSessionCookie();
  let res = await fetch(downloadUrl, {
    headers: {
      Cookie: cookie,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cookie = await getMinioSessionCookie(true);
    res = await fetch(downloadUrl, {
      headers: {
        Cookie: cookie,
      },
    });
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch object from MinIO (HTTP ${res.status}): ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  return {
    buffer,
    contentType,
  };
}

/**
 * Delete an object from MinIO bucket
 * @param bucketName Target bucket
 * @param fileName Object name
 */
export async function deleteFromMinio(bucketName: string, fileName: string): Promise<boolean> {
  const cleanName = sanitizeImageFilename(fileName);
  if (!cleanName) return false;

  const minioBase = config.minio.publicUrl.replace(/\/+$/, '');
  const deleteUrl = `${minioBase}/api/v1/buckets/${encodeURIComponent(
    bucketName
  )}/objects?prefix=${encodeURIComponent(cleanName)}&recursive=false&all_versions=false`;

  let cookie = await getMinioSessionCookie();
  let res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      Cookie: cookie,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cookie = await getMinioSessionCookie(true);
    res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Cookie: cookie,
      },
    });
  }

  return res.ok;
}
