# Stage 1: Build frontend and gateway
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY gateway/package.json gateway/

RUN npm ci

COPY frontend frontend
COPY gateway gateway

RUN npm --workspace=frontend run build
RUN npm --workspace=gateway run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl

COPY package.json package-lock.json ./
COPY gateway/package.json gateway/

RUN npm ci --workspace=gateway --omit=dev

COPY --from=builder /app/frontend/dist /app/frontend/dist
COPY --from=builder /app/gateway/dist /app/gateway/dist

EXPOSE 3000
ENV PORT=3000 NODE_ENV=production

CMD ["node", "gateway/dist/server.js"]
