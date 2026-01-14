# Connectty Web Client Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/web/package*.json ./packages/web/

# Install dependencies
RUN npm ci --workspace=@connectty/shared --workspace=@connectty/web

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web

# Build
RUN npm run build -w @connectty/shared
RUN npm run build -w @connectty/web

# Production image with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
