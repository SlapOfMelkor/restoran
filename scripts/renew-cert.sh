#!/bin/bash

# SSL Sertifikası Yenileme Script'i
# Bu script manuel olarak çalıştırılabilir veya cron job olarak ayarlanabilir

echo "### Renewing Let's Encrypt certificates ..."

docker compose -f docker-compose.production.yml run --rm certbot renew

echo "### Reloading nginx ..."
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload

echo "### Done!"

