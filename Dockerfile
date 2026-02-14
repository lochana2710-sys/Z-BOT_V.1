FROM node:20

RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EX3POSE 8000

CMD ["node", "index.js"]

