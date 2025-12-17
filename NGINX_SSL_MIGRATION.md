# 🔄 Caddy'den Nginx + Certbot'a Geçiş Rehberi

Bu rehber, Caddy'den Nginx + Certbot (Let's Encrypt) SSL çözümüne geçiş için adım adım talimatlar içerir.

---

## ✅ Yapılan Değişiklikler

1. ✅ **Caddy kaldırıldı** - `docker-compose.production.yml`'den Caddy servisi çıkarıldı
2. ✅ **Nginx Reverse Proxy eklendi** - Yeni `nginx-proxy` servisi eklendi
3. ✅ **Certbot eklendi** - Let's Encrypt SSL sertifikası için `certbot` servisi eklendi
4. ✅ **Nginx konfigürasyonları oluşturuldu** - `nginx/` klasörü altında konfigürasyonlar hazırlandı
5. ✅ **SSL kurulum script'leri eklendi** - `scripts/` klasöründe yardımcı script'ler hazırlandı

---

## 🚀 Hızlı Başlangıç

### 1. Mevcut Sistemi Durdur

```bash
cd ~/restoran
docker compose -f docker-compose.production.yml down
```

### 2. Caddy Volume'larını Temizle (Opsiyonel)

```bash
docker volume rm restoran_caddy_data restoran_caddy_config
```

### 3. Script'lere İzin Ver

```bash
chmod +x scripts/setup-ssl-simple.sh
chmod +x scripts/renew-cert.sh
```

### 4. SSL Sertifikası Al

```bash
./scripts/setup-ssl-simple.sh
```

Script size email adresinizi soracak. Let's Encrypt için geçerli bir email girin.

### 5. Tüm Servisleri Başlat

```bash
docker compose -f docker-compose.production.yml up -d
```

### 6. Test Et

Tarayıcıdan `https://mimarmuratdemir.com` adresine gidin. SSL sertifikasının çalıştığını kontrol edin.

---

## 📁 Yeni Dosya Yapısı

```
restoran/
├── docker-compose.production.yml  (güncellendi)
├── nginx/
│   ├── nginx.conf                 (yeni)
│   ├── conf.d/
│   │   └── default.conf            (yeni)
│   └── ssl/                       (yeni - mount point)
├── scripts/
│   ├── setup-ssl-simple.sh        (yeni - önerilen)
│   └── renew-cert.sh              (yeni)
├── SSL_SETUP.md                   (yeni - detaylı rehber)
└── NGINX_SSL_MIGRATION.md         (bu dosya)
```

---

## 🔧 Yapılandırma Detayları

### Nginx Reverse Proxy

- **Port 80**: HTTP (HTTPS'e yönlendirme + ACME challenge)
- **Port 443**: HTTPS (SSL sertifikası ile)
- **Backend**: `http://backend:8080` (API istekleri)
- **Frontend**: `http://frontend:80` (Static dosyalar)

### Certbot

- **Otomatik yenileme**: Her 12 saatte bir kontrol eder
- **Volume'lar**: 
  - `certbot-www`: ACME challenge dosyaları
  - `certbot-conf`: SSL sertifikaları

---

## 🔄 SSL Sertifikası Yenileme

### Otomatik

Certbot container'ı otomatik olarak sertifikaları yeniler. Herhangi bir işlem yapmanıza gerek yok.

### Manuel

```bash
./scripts/renew-cert.sh
```

---

## 🛠️ Sorun Giderme

### SSL Sertifikası Alınamıyor

1. **DNS Kontrolü:**
   ```bash
   nslookup mimarmuratdemir.com
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

### Nginx Başlamıyor

```bash
# Nginx konfigürasyonunu test et
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -t
```

### Sertifika Dosyaları Bulunamıyor

```bash
# Sertifika dosyalarını kontrol et
docker compose -f docker-compose.production.yml exec nginx-proxy ls -la /etc/letsencrypt/live/mimarmuratdemir.com/
```

---

## 📝 Önemli Notlar

1. **İlk Kurulum**: İlk kurulumda Nginx HTTP-only modda çalışır. SSL sertifikası alındıktan sonra HTTPS'e geçer.

2. **Email Adresi**: Let's Encrypt için geçerli bir email adresi kullanın (sertifika yenileme uyarıları için).

3. **DNS**: Domain'in DNS'i VPS IP'ye yönlendirilmiş olmalı.

4. **Port 80**: İlk kurulumda Port 80 mutlaka açık olmalı (ACME challenge için).

5. **Otomatik Yenileme**: Certbot container'ı otomatik olarak sertifikaları yeniler. Manuel işlem gerekmez.

---

## 🔐 Güvenlik

- SSL sertifikaları Docker volume'da saklanır
- Private key'ler asla git'e commit edilmemelidir
- HSTS header aktif (1 yıl)
- Modern SSL protokolleri kullanılır (TLS 1.2, TLS 1.3)

---

## 📞 Destek

Detaylı bilgi için `SSL_SETUP.md` dosyasına bakın.

---

**Son Güncelleme:** 2024

