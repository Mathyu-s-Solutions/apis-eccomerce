-- CreateTable
CREATE TABLE "shalom_pro_accounts" (
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "session" TEXT,
    "sender" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shalom_pro_accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "shalom_pro_shipments" (
    "ose_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shalom_pro_shipments_pkey" PRIMARY KEY ("ose_id")
);

-- CreateIndex
CREATE INDEX "shalom_pro_shipments_user_id_idx" ON "shalom_pro_shipments"("user_id");
