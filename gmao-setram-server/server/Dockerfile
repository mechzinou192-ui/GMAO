FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
# Données (base intégrée + pièces jointes) : volume persistant, propriété de l'utilisateur non privilégié
RUN mkdir -p /data/files && chown -R node:node /data
ENV DATA_DIR=/data \
    FILES_DIR=/data/files \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=256
USER node
# Base intégrée créée dès la construction : évite le pic mémoire du premier démarrage (sans effet si DATABASE_URL est fourni)
RUN JWT_SECRET=construction-uniquement-0123456789abcdef node src/prepare-db.js
EXPOSE 3000
# Contrôle de santé : le conteneur est « unhealthy » si l'application ne répond plus
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/start.js"]
