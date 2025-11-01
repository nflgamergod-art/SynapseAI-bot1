# Use official Node LTS image
FROM node:18-slim

# Create app directory
WORKDIR /app

# Install dependencies (use package-lock if present)
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose nothing (bot uses outbound websocket)
ENV NODE_ENV=production

# Run the compiled JS
CMD ["node", "dist/index.js"]
