#!/bin/bash

# Basit SSL Kurulum Script'i
# Bu script SSL sertifikasını alır, nginx konfigürasyonunu manuel düzenlemeniz gerekir

echo "=== SSL Sertifikası Kurulumu ==="
echo ""

# Email adresini al
read -p "Let's Encrypt için email adresiniz: " email
if [ -z "$email" ]; then
    echo "Email adresi zorunludur!"
    exit 1
fi

# .env.production dosyasının varlığını kontrol et
if [ ! -f .env.production ]; then
    echo "❌ HATA: .env.production dosyası bulunamadı!"
    echo "Lütfen önce .env.production dosyasını oluşturun:"
    echo "  cp env.production.template .env.production"
    echo "  nano .env.production"
    exit 1
fi

# .env.production dosyasını geçici olarak .env olarak kopyala (Docker Compose otomatik okur)
echo "📋 Environment dosyası yükleniyor..."
cp .env.production .env

echo ""
echo "1. Nginx proxy'yi başlatıyorum (HTTP-only)..."
docker compose -f docker-compose.production.yml up -d nginx-proxy frontend backend db

echo ""
echo "2. 10 saniye bekliyorum (nginx'in başlaması için)..."
sleep 10

echo ""
echo "3. Let's Encrypt sertifikası alınıyor..."
docker compose -f docker-compose.production.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$email" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d mimarmuratdemir.com \
  -d www.mimarmuratdemir.com

CERT_RESULT=$?

# .env dosyasını temizle (güvenlik için - .env.production'ı koruyoruz)
rm -f .env

if [ $CERT_RESULT -eq 0 ]; then
    echo ""
    echo "✅ Sertifika başarıyla alındı!"
    echo ""
    echo "📝 ŞİMDİ YAPMANIZ GEREKENLER:"
    echo ""
    echo "1. nginx/conf.d/default.conf dosyasını düzenleyin:"
    echo "   - HTTP server bloğundaki proxy location'ları kaldırın"
    echo "   - 'return 301 https://\$host\$request_uri;' satırını aktif edin (yorum satırından çıkarın)"
    echo ""
    echo "2. Nginx'i yeniden yükleyin:"
    echo "   docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload"
    echo ""
    echo "3. Test edin:"
    echo "   https://mimarmuratdemir.com"
    echo ""
    echo "Örnek nginx konfigürasyonu için SSL_SETUP.md dosyasına bakın."
else
    echo ""
    echo "❌ Sertifika alınamadı. Lütfen hataları kontrol edin:"
    echo "   - DNS ayarlarını kontrol edin"
    echo "   - Port 80'in açık olduğundan emin olun"
    echo "   - Nginx loglarını kontrol edin: docker compose -f docker-compose.production.yml logs nginx-proxy"
    exit 1
fi
