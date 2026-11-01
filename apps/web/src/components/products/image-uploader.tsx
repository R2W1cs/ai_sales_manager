"use client";

import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ProductImageResponse } from "@app/shared";

import {
  ALLOWED_PRODUCT_IMAGE_MIME_TYPES,
  MAX_PRODUCT_IMAGE_SIZE_BYTES,
  uploadProductImageViaPresigned,
} from "./product-upload-helper";

export interface ImageUploaderProps {
  businessId: string;
  productId?: string;
  images: ProductImageResponse[];
  onChange: (images: ProductImageResponse[]) => void;
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  disabled?: boolean;
}

function PendingPreviewItem({
  file,
  index,
  disabled,
  onDelete,
  primaryBadgeText,
  deleteText,
}: {
  file: File;
  index: number;
  disabled: boolean;
  onDelete: (index: number) => void;
  primaryBadgeText: string;
  deleteText: string;
}): React.ReactElement | null {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    return () => {
      reader.abort();
    };
  }, [file]);

  if (!dataUrl) return null;

  return (
    <div className="group relative flex aspect-square flex-col overflow-hidden rounded-md border border-border bg-muted/40">
      <Image
        src={dataUrl}
        alt={file.name}
        width={100}
        height={100}
        className="size-full object-cover"
        unoptimized
      />

      {index === 0 && (
        <span className="absolute inset-s-1.5 top-1.5 flex items-center gap-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-xs">
          <Star className="size-2.5 fill-current" />
          {primaryBadgeText}
        </span>
      )}

      {!disabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(index);
            }}
            className="size-7 p-0"
            title={deleteText}
            aria-label={deleteText}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ImageUploader({
  businessId,
  productId,
  images,
  onChange,
  pendingFiles = [],
  onPendingFilesChange,
  disabled = false,
}: ImageUploaderProps): React.ReactElement {
  const t = useTranslations("products");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleFiles(files: FileList | File[]) {
    setErrorMessage(null);
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    for (const file of fileList) {
      if (file.size > MAX_PRODUCT_IMAGE_SIZE_BYTES) {
        setErrorMessage(t("errSizeExceeded"));
        return;
      }
      if (!ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(file.type)) {
        setErrorMessage(t("errInvalidType"));
        return;
      }
    }

    if (!productId) {
      if (onPendingFilesChange) {
        onPendingFilesChange([...pendingFiles, ...fileList]);
      }
      return;
    }

    setIsUploading(true);
    void uploadExistingProductImages(fileList, productId, businessId, images)
      .then((updated) => {
        onChange(updated);
      })
      .catch(() => {
        setErrorMessage(t("errUploadFailed"));
      })
      .finally(() => {
        setIsUploading(false);
      });
  }

  function handleSetPrimary(image: ProductImageResponse) {
    if (disabled || !productId || image.isPrimary) return;

    apiClient
      .patch(
        `/api/v1/products/${productId}/images/${image.id}`,
        { isPrimary: true },
        { headers: businessId ? { "x-business-id": businessId } : undefined },
      )
      .then(() => {
        const updated = images.map((img) => ({
          ...img,
          isPrimary: img.id === image.id,
        }));
        onChange(updated);
      })
      .catch(() => {
        setErrorMessage(t("errSaveFailed"));
      });
  }

  function handleDeleteImage(image: ProductImageResponse) {
    if (disabled || !productId) return;

    apiClient
      .delete(`/api/v1/products/${productId}/images/${image.id}`, {
        headers: businessId ? { "x-business-id": businessId } : undefined,
      })
      .then(async () => {
        try {
          const freshImages = await apiClient.get<ProductImageResponse[]>(
            `/api/v1/products/${productId}/images`,
            { headers: businessId ? { "x-business-id": businessId } : undefined },
          );
          onChange(Array.isArray(freshImages) ? freshImages : []);
        } catch {
          const remaining = images.filter((img) => img.id !== image.id);
          onChange(remaining);
          setErrorMessage(t("errSaveFailed"));
        }
      })
      .catch(() => {
        setErrorMessage(t("errSaveFailed"));
      });
  }

  function handleDeletePending(index: number) {
    if (onPendingFilesChange) {
      const updatedFiles = pendingFiles.filter((_, i) => i !== index);
      onPendingFilesChange(updatedFiles);
    }
  }

  return (
    <div className="space-y-3" data-slot="image-uploader">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-foreground">{t("formImagesSection")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("uploaderHint")}</p>
        </div>
      </div>

      {/* Upload Dropzone */}
      {!disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files) {
              handleFiles(e.dataTransfer.files);
            }
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50 hover:bg-muted/20",
            isUploading && "pointer-events-none opacity-60",
          )}
        >
          <label className="flex cursor-pointer flex-col items-center justify-center space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                if (e.target.files) {
                  handleFiles(e.target.files);
                }
              }}
              className="sr-only"
              aria-label={t("uploaderDropzone")}
            />

            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {isUploading ? (
                <Loader2 className="size-5 animate-spin text-primary" />
              ) : (
                <UploadCloud className="size-5" />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {isUploading ? t("uploaderUploading") : t("uploaderDropzone")}
              </p>
              <p className="text-[11px] text-muted-foreground">{t("uploaderHint")}</p>
            </div>
          </label>
        </div>
      )}

      {/* Error alert */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Existing Images Grid */}
      {images.length > 0 && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image) => (
              <div
                key={image.id}
                className={cn(
                  "group relative flex aspect-square flex-col overflow-hidden rounded-md border bg-muted/30 transition-colors",
                  image.isPrimary ? "border-primary shadow-xs" : "border-border",
                )}
              >
                <Image
                  src={image.url}
                  alt={image.altText || "Product photo"}
                  width={100}
                  height={100}
                  className="size-full object-cover"
                  unoptimized
                />

                {image.isPrimary && (
                  <span className="absolute inset-s-1.5 top-1.5 flex items-center gap-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-xs">
                    <Star className="size-2.5 fill-current" />
                    {t("uploaderPrimaryBadge")}
                  </span>
                )}

                {!disabled && (
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
                    {!image.isPrimary && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetPrimary(image);
                        }}
                        className="size-7 p-0"
                        title={t("uploaderSetPrimary")}
                        aria-label={t("uploaderSetPrimary")}
                      >
                        <Check className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteImage(image);
                      }}
                      className="size-7 p-0"
                      title={t("uploaderDeleteImage")}
                      aria-label={t("uploaderDeleteImage")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Previews Grid */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pendingFiles.map((file, idx) => (
              <PendingPreviewItem
                key={`${file.name}-${file.size}-${file.lastModified}`}
                file={file}
                index={idx}
                disabled={disabled}
                onDelete={handleDeletePending}
                primaryBadgeText={t("uploaderPrimaryBadge")}
                deleteText={t("uploaderDeleteImage")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State hint */}
      {images.length === 0 && pendingFiles.length === 0 && !isUploading && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5 shrink-0" />
          <span>{t("formImagesDesc")}</span>
        </div>
      )}
    </div>
  );
}

async function uploadExistingProductImages(
  fileList: File[],
  productId: string,
  businessId: string | undefined,
  currentImages: ProductImageResponse[],
): Promise<ProductImageResponse[]> {
  const currentList = [...currentImages];
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    if (!f) continue;
    const isFirst = currentList.length === 0;
    const attached = await uploadProductImageViaPresigned(
      f,
      productId,
      businessId,
      isFirst,
      currentList.length,
    );
    currentList.push(attached);
  }
  return currentList;
}
