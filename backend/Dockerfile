FROM node:20-slim

RUN apt-get update

RUN apt-get install -y --no-install-recommends --fix-missing \
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

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY .env ./

COPY *.js ./

CMD ["npm", "run", "start"]