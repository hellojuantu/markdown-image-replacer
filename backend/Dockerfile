FROM node:20-slim

WORKDIR /app

RUN apt-get update

RUN apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      pkg-config \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "Server.js"] 