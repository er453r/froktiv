# Stage 1: install dev dependencies, check, test and build the app shell
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json tsconfig.sw.json CHANGELOG.md ./
COPY scripts ./scripts
COPY src ./src
COPY tests ./tests

RUN npm run typecheck && npm test && npm run build

# Stage 2: lightweight static HTTP server for the built app
FROM nginx:alpine-slim
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx.default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
