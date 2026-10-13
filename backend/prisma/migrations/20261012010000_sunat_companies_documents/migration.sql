-- CreateTable
CREATE TABLE "sunat_companies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "direccion" TEXT NOT NULL,
    "ubigeo" TEXT,
    "departamento" TEXT,
    "provincia" TEXT,
    "distrito" TEXT,
    "urbanizacion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logo" BYTEA,
    "logo_mime" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'beta',
    "sol_user" TEXT,
    "sol_password" TEXT,
    "certificate" TEXT,
    "certificate_info" JSONB,
    "api_client_id" TEXT,
    "api_client_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sunat_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sunat_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "issue_date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "customer_doc" TEXT,
    "customer_name" TEXT,
    "currency" TEXT,
    "total" DECIMAL(14,2),
    "hash" TEXT,
    "token" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "xml" BYTEA NOT NULL,
    "cdr" BYTEA,
    "sunat_code" TEXT,
    "sunat_message" TEXT,
    "observations" JSONB,
    "ticket" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_check_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sunat_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sunat_companies_user_id_ruc_key" ON "sunat_companies"("user_id", "ruc");

-- CreateIndex
CREATE UNIQUE INDEX "sunat_documents_token_key" ON "sunat_documents"("token");

-- CreateIndex
CREATE INDEX "sunat_documents_status_next_check_at_idx" ON "sunat_documents"("status", "next_check_at");

-- CreateIndex
CREATE INDEX "sunat_documents_company_id_created_at_idx" ON "sunat_documents"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sunat_documents_company_id_environment_type_series_number_key" ON "sunat_documents"("company_id", "environment", "type", "series", "number");

-- AddForeignKey
ALTER TABLE "sunat_companies" ADD CONSTRAINT "sunat_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sunat_documents" ADD CONSTRAINT "sunat_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "sunat_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

