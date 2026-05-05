FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 8090
CMD ["npx", "tsx", "src/index.ts"]
