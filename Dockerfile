FROM node:lts-alpine3.23
RUN apk add tzdata

USER node
WORKDIR /home/node

ADD --chown=node:node ./package.json .
RUN npm install
ADD --chown=node:node . .

RUN mkdir -p /home/node/data
VOLUME /home/node/data

ENV HTTP_PORT=80
ENV TZ=Europe/Berlin
ENV CHECKLIB_DATA=/home/node/data

ENV LOGLEVEL=info

HEALTHCHECK --interval=50m --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

CMD [ "node", "server.js" ]