FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      update-ca-certificates \
      git \
      python3 \
      build-essential \
      pkg-config \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      libpixman-1-dev \
      libpng-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY .env ./

COPY *.js ./

CMD ["npm", "run", "start"]
