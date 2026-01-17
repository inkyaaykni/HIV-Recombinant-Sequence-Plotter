# 1. 使用 slim 基础镜像
FROM node:20-slim

# 2. 【关键】安装 canvas 编译依赖 + 字体文件
# build-essential, libcairo2-dev 等：为了编译 canvas
# fonts-liberation: 提供类似 Arial 的字体（解决文字不显示问题）
# fontconfig: 刷新字体缓存
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    fonts-liberation \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# 3. 设置工作目录
WORKDIR /app

# 4. 复制依赖文件
COPY package.json ./

# 5. 安装依赖 (这一步会编译 C++，比较慢，请耐心等待)
RUN npm install --registry=https://registry.npmmirror.com

# 6. 复制脚本
COPY HIV_v3.js ./

# 7. 设置入口
ENTRYPOINT ["node", "HIV_v3.js"]