FROM node:20-alpine
WORKDIR /app
COPY server.js ./
ENV PORT=8082
ENV DATA=/data/scores.json
VOLUME ["/data"]
EXPOSE 8082
CMD ["node", "server.js"]
