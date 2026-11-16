# Stage 1: install dev dependencies, check, test and build dist/index.html
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY tests ./tests

RUN npm run typecheck && npm test && npm run build

# Stage 2: lightweight static HTTP server for the built page
FROM nginx:alpine-slim
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 80
