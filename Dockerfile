# Freebuff Nova — Docker/VPS 镜像
# 入口：server/adapters/node.entry.js（迁移 + API + 静态资源一体）
FROM node:22-alpine

WORKDIR /app

# 零第三方依赖：无需 npm install，直接拷贝源码
COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    DB_DRIVER=sqlite \
    SQLITE_PATH=/data/app.sqlite

# 本地持久卷（自动创建 data 目录）
RUN mkdir -p /data

EXPOSE 8080

# 启动时自动执行数据库迁移，然后提供 API + 静态资源服务
CMD ["node", "server/adapters/node.entry.js"]