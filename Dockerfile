FROM node:lts-alpine3.22
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
ENV CASSIS_REMOTE_ADR=https://14029.meine-homematic.de:8014/app/search/

ENV LOGLEVEL=info

HEALTHCHECK --interval=60m --timeout=5s --retries=3 CMD ["sh", "healthcheck.sh"]

CMD [ "node", "server.js" ]