FROM node:23.5-alpine3.20
RUN apk add tzdata
RUN apk add curl

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

HEALTHCHECK --interval=60m --timeout=5s --retries=3 CMD ["sh", "healthcheck.sh"]

CMD [ "node", "server.js" ]