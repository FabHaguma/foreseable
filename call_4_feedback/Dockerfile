FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3010 DATA_DIR=/data
WORKDIR /app
COPY package.json ./
COPY backend ./backend
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3010
CMD ["node", "backend/server.js"]
