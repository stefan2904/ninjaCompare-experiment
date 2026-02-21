FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Persist fetched data outside the container layer
VOLUME ["/app/data"]

ENV PORT=3001
ENV TZ=Europe/Vienna

EXPOSE 3001

CMD ["node", "index.js"]
