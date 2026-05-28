# Vite-Dev-Server-Image für das osim-ui Portal.
#
# Phase 1: nur Dev-Image (npm run dev mit Vite-HMR). Ein Production-Image
# (npm run build + nginx-static-serve) kommt in einer späteren Phase, sobald
# die Cloud-Deployment-Strategie steht.
#
# Build-Context-Konvention:
#   docker-compose: `build: ./portal`  (Standalone — keine Engine-Abhängigkeit)
#   Lokal:           `docker build -t osim-ui-portal:latest portal/`

# ---------- Stage 1: Deps ----------
FROM node:22-slim AS deps

WORKDIR /app

# package.json + package-lock.json zuerst, damit dieser Layer caches.
COPY package.json package-lock.json* ./

# `npm ci` wenn lock vorhanden (deterministisch); sonst `npm install`.
RUN npm ci 2>/dev/null || npm install

# ---------- Stage 2: Dev-Image ----------
FROM node:22-slim AS dev

ENV NODE_ENV=development

WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
COPY . .

# Vite-Dev-Server-Port (siehe portal/vite.config.ts — Phase 1 nutzt 3002).
EXPOSE 3002

# `--host 0.0.0.0` damit der Container-Port von außerhalb erreichbar ist.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
