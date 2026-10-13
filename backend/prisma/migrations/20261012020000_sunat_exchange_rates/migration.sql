-- CreateTable
CREATE TABLE "sunat_exchange_rates" (
    "date" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "quoted_date" TEXT NOT NULL,
    "purchase" DECIMAL(10,4),
    "sale" DECIMAL(10,4),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sunat_exchange_rates_pkey" PRIMARY KEY ("date","currency")
);

