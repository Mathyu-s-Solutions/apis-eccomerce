-- El portal autentica con Firebase (Google o correo/contraseña): la contraseña
-- ya no vive aquí. Se conserva la columna para no perder hashes existentes.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
