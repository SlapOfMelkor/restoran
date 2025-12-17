# 🔒 SSL Sertifikası Kurulum Rehberi (Nginx + Certbot)

Bu rehber, Caddy yerine **Nginx + Certbot (Let's Encrypt)** kullanarak SSL sertifikası kurulumunu açıklar.

---

## 📋 Ön Gereksinimler

1. ✅ Domain DNS'i VPS IP'ye yönlendirilmiş olmalı
2. ✅ Port 80 ve 443 açık olmalı
3. ✅ Docker ve Docker Compose kurulu olmalı

---

## 🚀 Kurulum Adımları

### 1. Mevcut Container'ları Durdur (İlk Kurulum İçin)

```bash
cd ~/restoran
docker compose -f docker-compose.production.yml down
```

### 2. Script'lere Çalıştırma İzni Ver

```bash
chmod +x scripts/setup-ssl-simple.sh
chmod +x scripts/renew-cert.sh
```

### 4. İlk SSL Sertifikası Al

**ÖNERİLEN YÖNTEM - Basit Script:**

```bash
# Script'e çalıştırma izni ver
chmod +x scripts/setup-ssl-simple.sh

# Script'i çalıştır (interaktif olarak email soracak)
./scripts/setup-ssl-simple.sh
```

Bu script otomatik olarak:
1. Nginx'i HTTP-only modda başlatır
2. Let's Encrypt sertifikası alır
3. Nginx konfigürasyonunu HTTPS'e geçirir
4. Nginx'i yeniden yükler

**VEYA Manuel Adımlar:**

```bash
# 1. Önce nginx-proxy'yi HTTP-only modda başlat
docker compose -f docker-compose.production.yml up -d nginx-proxy

# 2. 10 saniye bekle (nginx'in başlaması için)
sleep 10

# 3. Certbot ile sertifika al (email'i değiştirin)
docker compose -f docker-compose.production.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@mimarmuratdemir.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d mimarmuratdemir.com \
  -d www.mimarmuratdemir.com

# 4. Nginx konfigürasyonunu HTTPS'e geçir
# nginx/conf.d/default.conf dosyasında HTTP proxy kısmını kaldırıp
# "return 301 https://$host$request_uri;" satırını aktif edin

# 5. Nginx'i yeniden yükle
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload
```

### 5. Tüm Servisleri Başlat

```bash
docker compose -f docker-compose.production.yml up -d
```

### 6. Durumu Kontrol Et

```bash
# Container'ların durumu
docker compose -f docker-compose.production.yml ps

# Nginx logları
docker compose -f docker-compose.production.yml logs nginx-proxy

# Certbot logları
docker compose -f docker-compose.production.yml logs certbot

# SSL sertifikası kontrolü
docker compose -f docker-compose.production.yml exec nginx-proxy ls -la /etc/letsencrypt/live/mimarmuratdemir.com/
```

---

## 🔄 SSL Sertifikası Yenileme

Let's Encrypt sertifikaları 90 günde bir yenilenmelidir. Certbot container'ı otomatik olarak yenileme yapar, ama manuel de yapabilirsiniz:

### Otomatik Yenileme

Certbot container'ı zaten `docker-compose.production.yml` içinde otomatik yenileme yapacak şekilde yapılandırılmıştır. Her 12 saatte bir kontrol eder ve gerektiğinde yeniler.

### Manuel Yenileme

```bash
# Script ile
./scripts/renew-cert.sh

# Veya direkt
docker compose -f docker-compose.production.yml run --rm certbot renew
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload
```

---

## 🛠️ Sorun Giderme

### SSL Sertifikası Alınamıyor

1. **DNS Kontrolü:**
   ```bash
   nslookup mimarmuratdemir.com
   # VPS IP'nizi göstermeli
   ```

2. **Port Kontrolü:**
   ```bash
   sudo ufw status
   # 80 ve 443 açık olmalı
   ```

3. **Nginx Logları:**
   ```bash
   docker compose -f docker-compose.production.yml logs nginx-proxy
   ```

4. **Certbot Logları:**
   ```bash
   docker compose -f docker-compose.production.yml logs certbot
   ```

### ACME Challenge Başarısız

- Domain'in DNS'i doğru yönlendirilmiş mi kontrol edin
- Port 80'in açık olduğundan emin olun
- Firewall'da 80 portunu engellemediğinizden emin olun

### Nginx SSL Hatası

```bash
# Nginx konfigürasyonunu test et
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -t

# Sertifika dosyalarını kontrol et
docker compose -f docker-compose.production.yml exec nginx-proxy ls -la /etc/letsencrypt/live/mimarmuratdemir.com/
```

### Sertifika Yenileme Hatası

```bash
# Certbot'u manuel çalıştır ve hata mesajını gör
docker compose -f docker-compose.production.yml run --rm certbot renew --dry-run
```

---

## 📝 Cron Job ile Otomatik Yenileme (Opsiyonel)

Sunucuda cron job ekleyebilirsiniz:

```bash
# Crontab düzenle
crontab -e

# Her gün saat 03:00'da yenileme kontrolü yap
0 3 * * * cd /root/restoran && ./scripts/renew-cert.sh >> /var/log/certbot-renew.log 2>&1
```

---

## ✅ Test

1. Tarayıcıdan `https://mimarmuratdemir.com` adresine gidin
2. SSL sertifikasının geçerli olduğunu kontrol edin (yeşil kilit ikonu)
3. API isteklerinin çalıştığını test edin

---

## 🔐 Güvenlik Notları

- SSL sertifikaları Docker volume'da (`certbot-conf`) saklanır
- Private key'ler asla git'e commit edilmemelidir
- Sertifikalar otomatik olarak yenilenir (90 gün)
- HSTS header'ı aktif (1 yıl)

---

## 📞 Destek

Sorun yaşarsanız:
1. Nginx loglarını kontrol edin
2. Certbot loglarını kontrol edin
3. DNS ve port ayarlarını doğrulayın

---

**Son Güncelleme:** 2024

