FROM node:8

VOLUME /log

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

COPY server.js .

EXPOSE 443

CMD [ "npm", "start", "/log/dash-mqtt.log" ]
