# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node build.mjs

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

EXPOSE 4567

ENV NODE_ENV=production

CMD ["node", "dist/server/main.js"]
