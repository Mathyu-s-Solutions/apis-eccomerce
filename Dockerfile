# syntax=docker/dockerfile:1.7
#
# Imagen para Cloud Run (linux/amd64).
#  - build:   deps completas, cliente Prisma generado para Linux, nest build.
#  - runtime: solo deps de producción + Chromium headless shell (captcha Shalom).

ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=11.1.1

# ---------- build ----------
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
WORKDIR /app

# openssl: Prisma lo usa para elegir el engine correcto (debian-openssl-3.0.x).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm i -g pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY prisma ./prisma
# El postinstall corre `prisma generate` -> /app/generated/prisma
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json .swcrc ./
COPY src ./src
RUN pnpm build

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ARG PNPM_VERSION
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm i -g pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Solo producción y sin scripts (el cliente Prisma viene ya generado del build).
# Solo el headless shell de Chromium: es lo que usa chromium.launch({ headless: true }).
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
 && pnpm exec playwright install --with-deps --only-shell chromium \
 && npm rm -g pnpm \
 && rm -rf /root/.cache /root/.local/share/pnpm /var/lib/apt/lists/* /tmp/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated

USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
