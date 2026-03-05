# SuperDoc Collaboration Server + Agent
# For deployment to Google Cloud Run

FROM node:20-slim

# Cloud Run sets PORT dynamically (usually 8080)
# Default to 3050 for local testing
ENV NODE_ENV=production

WORKDIR /app

# Install dependencies (production only - no need for vite/vue devDependencies)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server files only (not the Vue client source)
COPY server.ts start.ts agent.ts ./
COPY public ./public

# Cloud Run sets PORT dynamically and routes traffic to it
# EXPOSE is informational only (Cloud Run ignores it)

# Cloud Run handles health checks via its own mechanism
# No HEALTHCHECK needed - Cloud Run uses the startup probe

# Run with tsx (TypeScript execution)
CMD ["npx", "tsx", "start.ts"]
