# Connectty Server Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

# Install dependencies
RUN npm ci --workspace=@connectty/shared --workspace=@connectty/server

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Build
RUN npm run build -w @connectty/shared
RUN npm run build -w @connectty/server

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/

# Copy root package.json for workspace resolution
COPY package.json ./

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@connectty/server

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run server
CMD ["node", "packages/server/dist/index.js"]
