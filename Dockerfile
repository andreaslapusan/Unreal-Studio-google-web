# Build determinista del SPA (Vite) y servido con nginx. Reemplaza a nixpacks
# (que fallaba con "npm: command not found" al no detectar Node en el VPS Coolify).
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
