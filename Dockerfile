# Build stage
FROM node:22-bookworm AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile \
    && pnpm --filter server run build \
    && pnpm --filter web run build

# Production stage
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get -o Acquire::Check-Valid-Until=false update \
    && apt-get install -y --no-install-recommends nginx curl \
    && rm -rf /var/lib/apt/lists/*

# Copy server build (fully bundled, no node_modules needed)
COPY --from=builder /app/apps/server/dist ./server/

# Copy web build
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/

# nginx config: serve static files + proxy /api to backend
RUN cat > /etc/nginx/sites-available/default <<'EOF'
server {
    listen 9876;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:6789;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ENV PORT=6789
ENV CORS_ORIGIN=*
ENV NODE_ENV=production

EXPOSE 6789 9876

# Start backend + nginx
CMD ["sh", "-c", "node /app/server/index.mjs & nginx -g 'daemon off;'"]
