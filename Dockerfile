FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
# 前端只需 Vite/React，跳过 sqlite3 等原生模块编译
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi

COPY . .

ENV VITE_API_BASE=http://server:8080

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host"]
