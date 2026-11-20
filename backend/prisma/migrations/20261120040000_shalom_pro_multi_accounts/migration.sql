-- Varias cuentas de Shalom Pro por cliente (plan Empresarial): la llave pasa a
-- ser (user_id, ref). Las cuentas que ya existen quedan como "default".
ALTER TABLE "shalom_pro_accounts" ADD COLUMN "ref" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "shalom_pro_accounts" DROP CONSTRAINT "shalom_pro_accounts_pkey";
ALTER TABLE "shalom_pro_accounts" ADD CONSTRAINT "shalom_pro_accounts_pkey" PRIMARY KEY ("user_id", "ref");

-- Cuenta con la que se creó cada guía (para pedir su rótulo y ticket).
ALTER TABLE "shalom_pro_shipments" ADD COLUMN "account_ref" TEXT NOT NULL DEFAULT 'default';
