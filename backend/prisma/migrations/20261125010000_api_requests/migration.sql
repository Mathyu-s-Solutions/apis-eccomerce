-- Registro de los requests a la API (30 días) para el panel de admin: qué endpoint llamó
-- cada cliente, con qué status y qué error recibió. Sin cuerpos.
-- CreateTable
CREATE TABLE "api_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "api_key_id" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "product" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "upstream" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_requests_user_id_created_at_idx" ON "api_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "api_requests_created_at_idx" ON "api_requests"("created_at");

-- AddForeignKey
ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

