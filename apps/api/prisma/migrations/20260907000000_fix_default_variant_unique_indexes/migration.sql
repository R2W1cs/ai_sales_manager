-- Drop broken non-partial unique indexes
DROP INDEX IF EXISTS "product_variants_product_id_is_default_key";
DROP INDEX IF EXISTS "product_images_product_id_is_primary_key";
DROP INDEX IF EXISTS "product_images_variant_id_is_primary_key";

-- Create indexes
CREATE INDEX IF NOT EXISTS "product_variants_product_id_is_default_idx" ON "product_variants"("product_id", "is_default");
CREATE INDEX IF NOT EXISTS "product_images_product_id_is_primary_idx" ON "product_images"("product_id", "is_primary");
CREATE INDEX IF NOT EXISTS "product_images_variant_id_is_primary_idx" ON "product_images"("variant_id", "is_primary");

-- Create partial unique indexes enforcing at most one default variant / primary image per product
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_id_is_default_unique" ON "product_variants"("product_id") WHERE is_default = true;
CREATE UNIQUE INDEX IF NOT EXISTS "product_images_product_id_is_primary_unique" ON "product_images"("product_id") WHERE is_primary = true;
CREATE UNIQUE INDEX IF NOT EXISTS "product_images_variant_id_is_primary_unique" ON "product_images"("variant_id") WHERE is_primary = true AND variant_id IS NOT NULL;
