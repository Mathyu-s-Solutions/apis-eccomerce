-- AlterTable
ALTER TABLE "sunat_documents" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sunat_documents_company_id_environment_idempotency_key_key" ON "sunat_documents"("company_id", "environment", "idempotency_key");

