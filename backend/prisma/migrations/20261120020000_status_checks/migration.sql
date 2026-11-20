-- CreateTable
CREATE TABLE "status_checks" (
    "component" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "detail" TEXT,

    CONSTRAINT "status_checks_pkey" PRIMARY KEY ("component","checked_at")
);

-- CreateIndex
CREATE INDEX "status_checks_checked_at_idx" ON "status_checks"("checked_at");
