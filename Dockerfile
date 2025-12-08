FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
# 将系统依赖安装与 npm 安装拆分，便于缓存
RUN apk add --no-cache python3 make g++
RUN npm ci --no-audit --no-fund

COPY . .

ENV VITE_API_BASE=http://server:8080

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host"]

