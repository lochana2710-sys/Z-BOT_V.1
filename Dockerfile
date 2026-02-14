FROM node:20

RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app


COPY . .


RUN npm install express @whiskeysockets/baileys pino yt-search @distube/ytdl-core @hapi/boom


ENV PORT=7860
EXPOSE 7860

CMD ["node", "index.js"]
