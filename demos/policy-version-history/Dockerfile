FROM node:22-alpine

WORKDIR /app

COPY server/package.json ./
RUN npm install --omit=dev

COPY server/index.ts ./

ENV NODE_ENV=production

CMD ["npm", "start"]
