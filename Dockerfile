# PralayDrishti - one container serving the API, the SignalR hub and the web dashboard.
#
#   docker build -t <dockerhub-user>/sihproject:1.0.0 .
#   docker run -p 8080:8080 --env-file .env <dockerhub-user>/sihproject:1.0.0
#
# Postgres (required) and Redis (optional) are separate services - see docs/DEPLOYMENT.md.

# ---------- 1. web dashboard (React + Vite) ----------
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2. API (.NET 8) ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
# restore first so the package layer is cached until a .csproj changes
COPY backend/src/PralayDrishti.Domain/PralayDrishti.Domain.csproj PralayDrishti.Domain/
COPY backend/src/PralayDrishti.Application/PralayDrishti.Application.csproj PralayDrishti.Application/
COPY backend/src/PralayDrishti.Infrastructure/PralayDrishti.Infrastructure.csproj PralayDrishti.Infrastructure/
COPY backend/src/PralayDrishti.API/PralayDrishti.API.csproj PralayDrishti.API/
RUN dotnet restore PralayDrishti.API/PralayDrishti.API.csproj
COPY backend/src/ ./
RUN dotnet publish PralayDrishti.API/PralayDrishti.API.csproj -c Release -o /out --no-restore /p:UseAppHost=false

# ---------- 3. runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
# QuestPDF (sitrep PDF export) needs fontconfig + a font on Linux; curl is for the container health check
RUN apt-get update \
 && apt-get install -y --no-install-recommends libfontconfig1 fonts-dejavu-core curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api /out ./
COPY --from=web /web/dist ./wwwroot
# seed data (dam register, demo exposure); runs, uploads and tile caches are created here at runtime
COPY data/seed ./data/seed
COPY data/exposure ./data/exposure
# create the writable folders up front: a volume mounted on a path that already exists in the image
# inherits its owner, otherwise it comes up root-owned and the non-root app user cannot write results
RUN mkdir -p data/runs data/uploads data/cache/terrain data/cache/osm data/dem data/models data/benchmarks data/gee_outbox/processed \
 && chown -R app:app /app/data

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    PralayDrishti__DataDir=/app/data \
    DOTNET_gcServer=0 \
    DOTNET_GCHeapHardLimitPercent=0x4B
EXPOSE 8080
USER app
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-8080}/health/live" || exit 1
ENTRYPOINT ["dotnet", "PralayDrishti.API.dll"]
