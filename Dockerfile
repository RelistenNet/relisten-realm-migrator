FROM node:20-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const options = { hostname: 'localhost', port: 3000, path: '/', method: 'GET', timeout: 2000 }; const req = http.request(options, (res) => { process.exit(res.statusCode === 404 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.on('timeout', () => process.exit(1)); req.end();"

# Start the application
CMD ["pnpm", "start"]