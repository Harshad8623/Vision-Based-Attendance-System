FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package*.json ./
# Optional public CA bundle supports TLS-verifying corporate/cloud proxies.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts playwright.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 CLASSLENS_DATA_DIR=/data
COPY backend/requirements.txt ./backend/requirements.txt
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    pip install --no-cache-dir -r backend/requirements.txt \
    && useradd --uid 10001 --create-home classlens \
    && mkdir /data && chown classlens:classlens /data
COPY --chown=classlens:classlens backend ./backend
COPY --from=web /app/dist ./dist
USER classlens
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
