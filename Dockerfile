FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
