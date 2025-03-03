# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Runtime stage
FROM node:22-alpine

WORKDIR /app

# Copy only the built files
COPY --from=builder /app/dist/main.cjs /app/dist/main.cjs.map ./

# Set environment variables check at runtime
ENV NODE_ENV=production

# Create a non-root user to run the application
RUN addgroup -S neurelo && adduser -S neurelo -G neurelo
USER neurelo

# Set the entrypoint
ENTRYPOINT ["node", "--enable-source-maps", "/app/main.cjs"]
