import { apiClient } from "@/lib/api-client";
import type { ProductImageResponse } from "@app/shared";

export const MAX_PRODUCT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
  url: string;
}

/**
 * Uploads a product image file directly to S3 via presigned PUT URL
 * and attaches the resulting S3 key to the product record.
 */
export async function uploadProductImageViaPresigned(
  file: File,
  productId: string,
  businessId?: string,
  isPrimary = false,
  sortOrder = 0,
): Promise<ProductImageResponse> {
  const headers = businessId ? { "x-business-id": businessId } : undefined;

  // 1. Request short-lived presigned upload URL from API
  const presigned = await apiClient.post<PresignedUrlResponse>(
    `/api/v1/products/${productId}/images/upload-url`,
    {
      filename: file.name,
      contentType: file.type,
    },
    { headers },
  );

  // 2. Direct PUT to S3 using presigned URL
  const uploadRes = await fetch(presigned.uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed with status ${uploadRes.status}`);
  }

  // 3. Attach image metadata record to product
  return apiClient.post<ProductImageResponse>(
    `/api/v1/products/${productId}/images`,
    {
      s3Key: presigned.s3Key,
      url: presigned.url,
      altText: file.name,
      isPrimary,
      sortOrder,
    },
    { headers },
  );
}
