FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm install

FROM node:22-alpine AS web-build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY package.json ./
COPY web ./web
RUN npm run build --workspace web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY package.json ./
COPY server ./server
COPY --from=web-build /app/web/dist ./web/dist
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "server"]
