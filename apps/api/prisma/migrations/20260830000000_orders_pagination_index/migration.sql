-- CreateIndex
CREATE INDEX "orders_business_id_created_at_id_idx" ON "orders"("business_id", "created_at" DESC, "id" DESC);
