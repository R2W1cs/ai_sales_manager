import * as fs from "node:fs";
import * as path from "node:path";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type ListObjectsV2CommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@app/shared/server";

const AWS_S3_REGION = env.AWS_REGION;

export const s3Client = new S3Client({
  region: AWS_S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: Boolean(env.S3_ENDPOINT),
  credentials:
    env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const BUCKET_NAME = env.S3_BUCKET;

const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), ".storage");

const isFallbackAllowed =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_LOCAL_STORAGE_FALLBACK === "true" ||
  Boolean(process.env.LOCAL_STORAGE_DIR);

function getLocalFilePath(key: string): string {
  const sanitized = key.replace(/\.\./g, "");
  return path.join(LOCAL_STORAGE_DIR, sanitized);
}

function writeToLocalStorage(
  key: string,
  body: Buffer | Uint8Array | string | ReadableStream,
): void {
  try {
    const filePath = getLocalFilePath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (Buffer.isBuffer(body) || typeof body === "string") {
      fs.writeFileSync(filePath, body);
    } else if (body instanceof Uint8Array) {
      fs.writeFileSync(filePath, Buffer.from(body));
    }
  } catch {
    // Non-fatal if local disk write fails
  }
}

/**
 * Storage utilities for S3 operations with non-production test fallback
 */

/**
 * Upload a file to S3
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string | ReadableStream,
  options?: {
    contentType?: string;
    metadata?: Record<string, string>;
    acl?: "private" | "public-read";
  },
): Promise<{ key: string; etag?: string }> {
  const input: PutObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: options?.contentType,
    Metadata: options?.metadata,
    ACL: options?.acl,
  };

  try {
    const command = new PutObjectCommand(input);
    const response = await s3Client.send(command);
    return {
      key,
      etag: response.ETag,
    };
  } catch (err) {
    if (!isFallbackAllowed) {
      throw err;
    }
    writeToLocalStorage(key, body);
    return {
      key,
      etag: "local-fallback",
    };
  }
}

/**
 * Download a file from S3
 */
export async function downloadFile(key: string): Promise<{
  body: ReadableStream | null;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  try {
    const command = new GetObjectCommand(input);
    const response = await s3Client.send(command);

    return {
      body: response.Body?.transformToWebStream() ?? null,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      metadata: response.Metadata,
    };
  } catch (err) {
    if (isFallbackAllowed) {
      const filePath = getLocalFilePath(key);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        return {
          body: null,
          contentLength: stat.size,
        };
      }
    }
    throw new Error(`File not found in S3: ${key}`, { cause: err });
  }
}

/**
 * Download file as Buffer
 */
export async function downloadFileAsBuffer(key: string): Promise<Buffer> {
  const input: GetObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  try {
    const command = new GetObjectCommand(input);
    const response = await s3Client.send(command);

    if (response.Body) {
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    }
  } catch (err) {
    if (!isFallbackAllowed) {
      throw err;
    }
  }

  if (isFallbackAllowed) {
    const filePath = getLocalFilePath(key);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  }

  throw new Error(`File not found in S3 or local storage: ${key}`);
}

/**
 * Delete a file from S3 and local storage
 */
export async function deleteFile(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
  } catch {
    // Non-fatal
  }

  if (isFallbackAllowed) {
    try {
      const filePath = getLocalFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Delete multiple files from S3
 */
export async function deleteFiles(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteFile(key)));
}

/**
 * List files in a directory/prefix
 */
export async function listFiles(
  prefix?: string,
  options?: {
    maxKeys?: number;
    continuationToken?: string;
  },
): Promise<{
  files: { key: string; size?: number; lastModified?: Date }[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}> {
  const input: ListObjectsV2CommandInput = {
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: options?.maxKeys ?? 1000,
    ContinuationToken: options?.continuationToken,
  };

  const command = new ListObjectsV2Command(input);
  const response = await s3Client.send(command);

  return {
    files: (response.Contents ?? []).flatMap((item) => {
      if (item.Key === undefined) {
        return [];
      }
      return [{ key: item.Key, size: item.Size, lastModified: item.LastModified }];
    }),
    isTruncated: response.IsTruncated ?? false,
    nextContinuationToken: response.NextContinuationToken,
  };
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch {
    if (isFallbackAllowed) {
      const filePath = getLocalFilePath(key);
      return fs.existsSync(filePath);
    }
    return false;
  }
}

/**
 * Get file metadata without downloading the file
 */
export async function getFileMetadata(key: string): Promise<{
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  lastModified?: Date;
} | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Copy a file within S3
 */
export async function copyFile(
  sourceKey: string,
  destinationKey: string,
): Promise<{ key: string; etag?: string }> {
  const command = new CopyObjectCommand({
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${sourceKey}`,
    Key: destinationKey,
  });

  const response = await s3Client.send(command);

  return {
    key: destinationKey,
    etag: response.CopyObjectResult?.ETag,
  };
}

/**
 * Move a file within S3 (copy then delete)
 */
export async function moveFile(
  sourceKey: string,
  destinationKey: string,
): Promise<{ key: string; etag?: string }> {
  const result = await copyFile(sourceKey, destinationKey);
  await deleteFile(sourceKey);
  return result;
}

/**
 * Generate a presigned URL for uploading a file
 */
export async function getUploadUrl(
  key: string,
  options?: {
    expiresIn?: number;
    contentType?: string;
  },
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: options?.contentType,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: options?.expiresIn ?? 3600,
  });
}

/**
 * Generate a presigned URL for downloading a file
 */
export async function getDownloadUrl(
  key: string,
  options?: {
    expiresIn?: number;
    responseContentDisposition?: string;
  },
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: options?.responseContentDisposition,
    });

    return await getSignedUrl(s3Client, command, {
      expiresIn: options?.expiresIn ?? 3600,
    });
  } catch (err) {
    if (isFallbackAllowed) {
      return `/api/v1/storage/${encodeURIComponent(key)}`;
    }
    throw err;
  }
}

/**
 * Get the public URL for a file (only works if bucket/file has public access)
 */
export function getPublicUrl(key: string): string {
  return `https://${BUCKET_NAME}.s3.${AWS_S3_REGION}.amazonaws.com/${key}`;
}
