#!/usr/bin/env bash
# One-shot host setup for a fresh Ubuntu 22.04/24.04 VPS (e.g. Hetzner CX22).
# Installs Docker, opens only the ports we need, and brings up the backend
# stack (API + Postgres + coturn) behind Caddy HTTPS.
#
# Usage (run as root or with sudo, from the project root on the VPS):
#   cp .env.docker.example .env      # then fill in the REQUIRED values below
#   sudo bash deploy/provision.sh
#
# REQUIRED in .env before running:
#   POSTGRES_PASSWORD           strong db password
#   JOBSEARCH_ENCRYPTION_KEY    see: docker compose run --rm api \
#                                 python -m jobsearch.security.crypto keygen
#   JOBSEARCH_JWT_PRIVATE_KEY / JOBSEARCH_JWT_PUBLIC_KEY   (RS256 PEMs)
#   JOBSEARCH_CORS_ORIGINS      your frontend origin, e.g. https://app.readdy.ai
#   API_DOMAIN                  api hostname with DNS A record -> this VPS IP
#   TURN_SECRET / JOBSEARCH_TURN_URLS   (only if using the TURN relay)
set -euo pipefail

cd "$(dirname "$0")/.."   # project root
[ -f .env ] || { echo "ERROR: create .env first (cp .env.docker.example .env)"; exit 1; }

echo "==> Installing Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
	curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose plugin missing"; exit 1; }

echo "==> Configuring the firewall (ufw)"
apt-get update -qq && apt-get install -y -qq ufw
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (ACME + redirect)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
# TURN relay (coturn runs with host networking; these must match turnserver.conf)
ufw allow 3478/tcp comment 'TURN'
ufw allow 3478/udp comment 'TURN'
ufw allow 49160:49200/udp comment 'TURN relay range'
ufw --force enable
ufw status verbose

# Include coturn only if a TURN URL is configured.
PROFILES=""
if grep -qE '^JOBSEARCH_TURN_URLS=.+' .env; then
	PROFILES="--profile turn"
	SERVICES="db api caddy coturn"
	echo "==> TURN configured -> starting coturn too"
else
	SERVICES="db api caddy"
	echo "==> No TURN configured -> API + DB + Caddy only"
fi

echo "==> Building and starting: $SERVICES"
docker compose -f docker-compose.yml -f docker-compose.prod.yml $PROFILES up -d --build $SERVICES

echo "==> Installing the nightly database backup cron"
install -m 0755 deploy/backup.sh /usr/local/bin/jobsearch-backup.sh
mkdir -p /opt/jobsearch-backups
# 03:15 daily; logs to syslog. PROJECT_DIR lets the script find the compose file.
BACKUP_CRON="15 3 * * * PROJECT_DIR=$(pwd) /usr/local/bin/jobsearch-backup.sh >> /var/log/jobsearch-backup.log 2>&1"

echo "==> Installing the auto-apply / saved-search scheduler cron (every 15 min)"
# Runs due auto-apply grants + saved searches inside the api container.
SCHED_CRON="*/15 * * * * cd $(pwd) && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api python -m jobsearch.scheduler >> /var/log/jobsearch-scheduler.log 2>&1"

( crontab -l 2>/dev/null | grep -v -e jobsearch-backup.sh -e jobsearch.scheduler; echo "$BACKUP_CRON"; echo "$SCHED_CRON" ) | crontab -

echo
echo "==> Done. Watch it come up with:  docker compose ps"
echo "    API health (once DNS + cert settle):  https://$(grep -E '^API_DOMAIN=' .env | cut -d= -f2)/health"
