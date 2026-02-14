FROM node:20

RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN git clone https://github.com/lochana2710-sys/Z-BOT_V.1 .

RUN npm install

ENV PORT=7860
EXPOSE 7860

CMD ["node", "index.js"]
