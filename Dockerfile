# Reusable Docker image for any cloud (Fly.io, Cloud Run, Heroku alt, self-hosted)
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 native build deps
RUN apk add --no-cache python3 make g++

# Cache deps layer
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server.js"]
