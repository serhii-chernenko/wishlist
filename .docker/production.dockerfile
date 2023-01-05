FROM node:latest

RUN mkdir -p /wishlist/bot
WORKDIR /wishlist

COPY ./package.json ./
COPY ./bot ./bot/

RUN npm i --omit=dev

CMD ["npm", "start"]