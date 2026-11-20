-- CreateTable
CREATE TABLE "olva_shipments" (
    "cart_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "olva_shipments_pkey" PRIMARY KEY ("cart_id")
);

-- CreateIndex
CREATE INDEX "olva_shipments_user_id_idx" ON "olva_shipments"("user_id");

