import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Cargar datos de nuestra propia API al montar un componente cliente es un
      // patrón válido aquí; la regla nueva es demasiado estricta para este caso.
      "react-hooks/set-state-in-effect": "warn",
      // Asignar document.cookie es una API legítima del navegador.
      "react-hooks/immutability": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
