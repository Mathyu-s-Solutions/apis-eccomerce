-- Historial de las cuentas de Shalom Pro que cada cliente conecta y desconecta (para ver si
-- turna negocios en una cuenta en vez de usar el plan Plataforma). Solo huellas HMAC.
-- CreateTable
CREATE TABLE "shalom_pro_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "account_hash" TEXT NOT NULL,
    "sender_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shalom_pro_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shalom_pro_connections_user_id_created_at_idx" ON "shalom_pro_connections"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "shalom_pro_connections" ADD CONSTRAINT "shalom_pro_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

