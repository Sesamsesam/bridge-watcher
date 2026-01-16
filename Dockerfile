# Bridge Runner Docker Image
# Secure sandbox for executing AI tasks

FROM oven/bun:1.1-alpine

# Install required tools
RUN apk add --no-cache \
    git \
    curl \
    bash \
    coreutils

# The oven/bun image already has a 'bun' user (UID 1000)
# We'll use that instead of creating a new user

# Set working directory
WORKDIR /workspace

# Switch to non-root user (bun user from base image)
USER bun

# Default command (will be overridden by runner)
CMD ["echo", "bridge-runner ready"]

