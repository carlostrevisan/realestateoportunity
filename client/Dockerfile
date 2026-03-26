# ── Production stage — builds static assets ─────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Accept Clerk Key as a build argument
ARG VITE_CLERK_PUBLISHABLE_KEY

COPY package*.json ./
RUN npm install

COPY . .
# Pass the argument as an environment variable for Vite to bake it in
RUN VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY npm run build

# ── Production stage — serve with nginx ─────────────────────────────
FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html

# Forward /api/* to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]

# ── Development stage — Vite dev server ─────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
