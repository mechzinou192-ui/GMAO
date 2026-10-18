FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
# Pièces jointes (photos) : volume persistant, propriété de l'utilisateur non privilégié
RUN mkdir -p /data/files && chown -R node:node /data
ENV FILES_DIR=/data/files
USER node
EXPOSE 3000
# Contrôle de santé : le conteneur est « unhealthy » si l'application ne répond plus
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/start.js"]
