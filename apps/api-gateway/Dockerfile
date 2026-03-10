# syntax=docker/dockerfile:1
FROM node:20.20.1-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/database/package.json ./packages/database/
COPY packages/redis/package.json ./packages/redis/
COPY packages/kafka/package.json ./packages/kafka/
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY apps/transaction-service/package.json ./apps/transaction-service/
COPY apps/fraud-service/package.json ./apps/fraud-service/
COPY apps/notification-service/package.json ./apps/notification-service/
COPY apps/analytics-service/package.json ./apps/analytics-service/
COPY frontend/package.json ./frontend/

RUN npm ci

COPY packages/types ./packages/types
COPY packages/database ./packages/database
COPY packages/redis ./packages/redis
COPY packages/kafka ./packages/kafka
COPY apps/api-gateway ./apps/api-gateway
COPY tsconfig.base.json ./

RUN npm run build -w packages/types && \
    npm run build -w packages/database && \
    npm run build -w packages/redis && \
    npm run build -w packages/kafka && \
    npm run build -w apps/api-gateway

# Replace workspace symlinks with real directories so Node.js can resolve them
RUN rm -rf /app/node_modules/@finflow/types && \
    mkdir -p /app/node_modules/@finflow/types && \
    cp /app/packages/types/package.json /app/node_modules/@finflow/types/package.json && \
    cp -r /app/packages/types/dist /app/node_modules/@finflow/types/dist
RUN rm -rf /app/node_modules/@finflow/database && \
    mkdir -p /app/node_modules/@finflow/database && \
    cp /app/packages/database/package.json /app/node_modules/@finflow/database/package.json && \
    cp -r /app/packages/database/dist /app/node_modules/@finflow/database/dist
RUN rm -rf /app/node_modules/@finflow/redis && \
    mkdir -p /app/node_modules/@finflow/redis && \
    cp /app/packages/redis/package.json /app/node_modules/@finflow/redis/package.json && \
    cp -r /app/packages/redis/dist /app/node_modules/@finflow/redis/dist
RUN rm -rf /app/node_modules/@finflow/kafka && \
    mkdir -p /app/node_modules/@finflow/kafka && \
    cp /app/packages/kafka/package.json /app/node_modules/@finflow/kafka/package.json && \
    cp -r /app/packages/kafka/dist /app/node_modules/@finflow/kafka/dist

EXPOSE 3001
CMD ["node", "apps/api-gateway/dist/server.js"]
