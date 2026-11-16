# Preparation is intentionally online; the resulting image runs with --network none.
# Build with a source-only snapshot as context, never the developer's home or env.
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS node
FROM postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536
COPY --from=node /usr/local/ /usr/local/
COPY scripts/verification/infra/dependencies.json scripts/verification/infra/download-postgrest.mjs /opt/compor-infra-build/
RUN node /opt/compor-infra-build/download-postgrest.mjs \
    && node --version && npm --version && postgres --version && psql --version && openssl version
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/agile-deliberation/package.json packages/agile-deliberation/package-lock.json ./packages/agile-deliberation/
COPY packages/agents-api/package.json packages/agents-api/package-lock.json ./packages/agents-api/
COPY packages/private-images/package.json packages/private-images/package-lock.json ./packages/private-images/
COPY packages/remote-mcp/package.json packages/remote-mcp/package-lock.json ./packages/remote-mcp/
COPY packages/images-api/package.json ./packages/images-api/
COPY packages/attempt-metrics/package.json ./packages/attempt-metrics/
COPY apps/web/package.json apps/web/package-lock.json apps/web/.npmrc ./apps/web/
RUN npm ci --ignore-scripts \
    && npm ci --ignore-scripts --prefix packages/agile-deliberation \
    && npm ci --ignore-scripts --prefix packages/agents-api \
    && npm ci --ignore-scripts --prefix packages/private-images \
    && npm ci --ignore-scripts --prefix packages/remote-mcp
# The web lockfile uses install-links=true: npm packs local file: dependencies.
# Supply their real sources before npm ci so the installed packages are complete.
COPY packages/ ./packages/
RUN npm ci --ignore-scripts --prefix apps/web
COPY . /workspace
RUN mkdir -p /opt/compor-verification \
    && dpkg-query -W > /opt/compor-verification/debian-packages.txt \
    && cp scripts/verification/infra/dependencies.json /opt/compor-verification/dependencies.json
# PostgreSQL runs as its own user; the outer supervisor is responsible for
# dropping privileges for product processes and for isolating evidence mounts.
ENTRYPOINT []
CMD ["node", "scripts/verification/infra/preflight.mjs"]
