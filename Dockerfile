FROM node:20-alpine AS build

WORKDIR /app/server

COPY server/package.json ./
COPY server/package-lock.json ./
RUN npm ci

COPY server/ ./
COPY data ../data

RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app/server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=2567

COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/data ../data

EXPOSE 2567

CMD ["node", "dist/index.js"]
