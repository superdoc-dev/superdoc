# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.57.0-jammy
WORKDIR /app

# Install a minimal set of fonts so UI typography matches local dev closer
RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-liberation fonts-dejavu-core fonts-noto-core && \
    rm -rf /var/lib/apt/lists/*

ENV CI="true"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY --exclude=e2e-tests . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
RUN pnpm run pack
RUN --mount=type=cache,id=pnpm,target=/pnpm/store cd examples && pnpm install --no-frozen-lockfile

CMD ["bash", "-c", "pnpm run --prefix examples/tests test $PLAYWRIGHT_ARGS --workers=4"]
