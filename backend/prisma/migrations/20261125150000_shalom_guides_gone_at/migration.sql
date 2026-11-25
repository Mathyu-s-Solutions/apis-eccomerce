-- Guías que Shalom encontró antes y ya no muestra (unos días después de entregadas): por
-- 6 h se responde 404 sin volver a preguntarle. Nullable: no toca las filas existentes.
ALTER TABLE "shalom_guides" ADD COLUMN "gone_at" TIMESTAMP(3);
