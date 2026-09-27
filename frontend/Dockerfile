# Campus Relay PWA - container image for the single-machine self-host install.
#
# Build context is the frontend/ directory:
#   docker build -t campus-relay-web ./frontend
#
# In the single-machine install the browser talks only to this container; nginx
# serves the built PWA and proxies /api to the backend container, so the app and
# the API share one origin and no CORS or VITE_API_BASE_URL is needed.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Leave empty for the same-origin (nginx proxy) install. Set to the backend's
# public URL for a split deployment if you build this image directly.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
