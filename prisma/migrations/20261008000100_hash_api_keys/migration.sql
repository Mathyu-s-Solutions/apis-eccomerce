-- DropIndex
DROP INDEX "api_keys_key_key";

-- AlterTable
ALTER TABLE "api_keys" DROP COLUMN "key",
ADD COLUMN     "key_hash" TEXT NOT NULL,
ADD COLUMN     "prefix" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
