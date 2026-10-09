-- CreateTable
CREATE TABLE "shalom_guides" (
    "key_hash" TEXT NOT NULL,
    "ose_id" TEXT NOT NULL,
    "transit_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shalom_guides_pkey" PRIMARY KEY ("key_hash")
);

