# Use Debian-based Node.js image instead of Alpine to avoid Sharp issues
FROM node:24-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libvips-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and prisma schema
COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src ./src/

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

# Install production dependencies only
RUN rm -rf node_modules && npm ci --only=production && npm cache clean --force

# Production stage
FROM node:24-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built application and dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Switch to non-root user
USER nodejs

# Set environment variables
ENV PORT=5001
ENV NODE_ENV=production

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]