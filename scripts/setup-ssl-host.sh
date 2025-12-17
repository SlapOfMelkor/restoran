#!/bin/bash

# Host'ta Certbot ile SSL Sertifikası Kurulum Script'i
# Bu script host sisteminde certbot kullanır (Docker container değil)

echo "=== Host Certbot ile SSL Sertifikası Kurulumu ==="
echo ""

# Root kontrolü
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Bu script root olarak çalıştırılmalıdır (sudo)"
    exit 1
fi

# Email adresini al
read -p "Let's Encrypt için email adresiniz: " email
if [ -z "$email" ]; then
    echo "Email adresi zorunludur!"
    exit 1
fi

echo ""
echo "1. Certbot'un kurulu olduğunu kontrol ediyorum..."
if ! command -v certbot &> /dev/null; then
    echo "Certbot bulunamadı, kuruluyor..."
    apt update
    apt install -y certbot
fi

echo ""
echo "2. Nginx container'ını durduruyorum (port 80'i serbest bırakmak için)..."
cd ~/restoran
docker compose -f docker-compose.production.yml stop nginx-proxy

echo ""
echo "3. Port 80'in boş olduğunu kontrol ediyorum..."
if netstat -tlnp | grep -q ":80 "; then
    echo "⚠️  Port 80 hala kullanımda! Lütfen kontrol edin."
    exit 1
fi

echo ""
echo "4. SSL sertifikası alınıyor (standalone mod)..."
certbot certonly --standalone \
  --preferred-challenges http \
  --email "$email" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  --verbose \
  -d mimarmuratdemir.com \
  -d www.mimarmuratdemir.com

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Sertifika başarıyla alındı!"
    echo ""
    echo "5. Sertifikaları Docker volume'a kopyalıyorum..."
    
    # Host'taki sertifika dizinleri
    CERT_DIR="/etc/letsencrypt/live/mimarmuratdemir.com"
    ARCHIVE_DIR="/etc/letsencrypt/archive/mimarmuratdemir.com"
    
    # Volume'u kontrol et
    if ! docker volume inspect restoran_certbot-conf &> /dev/null; then
        echo "⚠️  certbot-conf volume bulunamadı, oluşturuluyor..."
        docker volume create restoran_certbot-conf
    fi
    
    # Geçici container ile volume'a kopyala
    echo "Sertifikalar kopyalanıyor..."
    docker run --rm \
      -v restoran_certbot-conf:/target \
      -v /etc/letsencrypt:/source:ro \
      alpine sh -c "
        mkdir -p /target/live/mimarmuratdemir.com
        mkdir -p /target/archive/mimarmuratdemir.com
        cp -r /source/live/mimarmuratdemir.com/* /target/live/mimarmuratdemir.com/ 2>/dev/null || true
        cp -r /source/archive/mimarmuratdemir.com/* /target/archive/mimarmuratdemir.com/ 2>/dev/null || true
        ls -la /target/live/mimarmuratdemir.com/
        echo '✅ Sertifikalar kopyalandı'
      "
    
    echo ""
    echo "6. Nginx container'ını başlatıyorum..."
    docker compose -f docker-compose.production.yml start nginx-proxy
    
    echo ""
    echo "✅ SSL kurulumu tamamlandı!"
    echo ""
    echo "📝 ŞİMDİ YAPMANIZ GEREKENLER:"
    echo ""
    echo "1. nginx/conf.d/default.conf dosyasını düzenleyin:"
    echo "   - HTTP server bloğundaki proxy location'ları kaldırın"
    echo "   - 'return 301 https://\$host\$request_uri;' satırını aktif edin"
    echo "   - HTTPS server bloğunu aktif edin (yorum satırlarından çıkarın)"
    echo ""
    echo "2. Nginx'i yeniden yükleyin:"
    echo "   docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload"
    echo ""
    echo "3. Test edin:"
    echo "   https://mimarmuratdemir.com"
else
    echo ""
    echo "❌ Sertifika alınamadı. Lütfen hataları kontrol edin."
    echo ""
    echo "6. Nginx'i tekrar başlatıyorum..."
    docker compose -f docker-compose.production.yml start nginx-proxy
    exit 1
fi

