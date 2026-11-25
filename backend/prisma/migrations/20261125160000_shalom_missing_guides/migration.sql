-- Guías (guía + clave) que Shalom nunca encontró: por 2 h se responde 404 sin volver a
-- preguntarle. Solo el hash de guía + clave, como shalom_guides; se borran al día.
-- CreateTable
CREATE TABLE "shalom_missing_guides" (
    "key_hash" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shalom_missing_guides_pkey" PRIMARY KEY ("key_hash")
);

-- CreateIndex
CREATE INDEX "shalom_missing_guides_checked_at_idx" ON "shalom_missing_guides"("checked_at");

