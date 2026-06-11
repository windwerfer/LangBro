FROM mcr.microsoft.com/devcontainers/javascript-node:24-trixie


# Prepare workspace directory as root and set correct ownership
RUN mkdir -p /workspace && chown -R node:node /workspace

# Switch to non-root user
USER node
WORKDIR /workspace

# Configure npm to use user-owned global directory (avoids permission issues later)
RUN mkdir -p ~/.npm-global \
    && npm config set prefix '~/.npm-global' \
    && echo 'export PATH="$PATH:~/.npm-global/bin"' >> ~/.bashrc \
    && echo 'export PATH="$PATH:~/.npm-global/bin"' >> ~/.zshrc

# Ensure zsh is the default shell for the node user
RUN sudo chsh -s /usr/bin/zsh node
