FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN corepack enable && pnpm install --prod --no-lockfile

COPY . .

# Cloud Run/Functions set PORT; default to 8080
ENV PORT=8080

CMD ["pnpm", "start"]
