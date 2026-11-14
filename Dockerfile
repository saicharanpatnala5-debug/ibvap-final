# Multi-stage Dockerfile for IBVAP (Intelligent Border Video Analytics Platform)

# Stage 1: Build frontend and server bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy project source files
COPY . .

# Build Vite client SPA and bundle server.ts -> dist/server.cjs
RUN npm run build

# Stage 2: Production minimal runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled bundles, static assets, and offline models
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/eng.traineddata ./eng.traineddata

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.cjs"]
