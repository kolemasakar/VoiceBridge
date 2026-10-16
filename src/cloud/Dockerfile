FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# KRC MEDIA BETA runtime parity requirements:
# - ffmpeg/ffprobe: local attachment normalization and duration probing
# - psql: durable PostgreSQL/Neon managed-media store
RUN apk add --no-cache ffmpeg postgresql-client

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080

USER node

CMD ["node", "dist/src/index.js"]
