# Stage 1: Builder
FROM node:24-slim AS builder

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Prune dev dependencies for production
RUN pnpm prune --prod

# Stage 2: Runtime
FROM node:24-slim

# Labels
LABEL org.opencontainers.image.source="https://github.com/relistennet/relisten-realm-migrator"
LABEL org.opencontainers.image.description="Relisten Realm database migration service"

# Install runtime dependencies (curl for healthcheck, tini for signal handling)
RUN apt-get update && apt-get install -y \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/index.js ./

# Set production environment
ENV NODE_ENV=production

# Use non-root user
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Use tini as init process for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "index.js"]
