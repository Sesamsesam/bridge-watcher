# Bridge Runner Docker Image
# Secure sandbox for executing AI tasks

FROM oven/bun:1.1-alpine

# Install required tools
RUN apk add --no-cache \
    git \
    curl \
    bash \
    coreutils

# Create non-root user
RUN adduser -D -u 1000 runner

# Install OpenCode CLI (if available)
# Note: This may need adjustment based on OpenCode installation method
# RUN npm install -g opencode

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER runner

# Default command (will be overridden by runner)
CMD ["echo", "bridge-runner ready"]
