FROM docker.io/library/node:24-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Update npm as root (best practice) - but not needed, because the image already has the latest npm
# RUN npm install -g npm@latest

# Prepare workspace directory as root and set correct ownership
RUN mkdir -p /workspace && chown -R node:node /workspace

# Switch to non-root user
USER node
WORKDIR /workspace

# Configure npm to use user-owned global directory (avoids permission issues later)
RUN mkdir -p ~/.npm-global \
    && npm config set prefix '~/.npm-global' \
    && echo 'export PATH="$PATH:~/.npm-global/bin"' >> ~/.bashrc

CMD ["bash"]
