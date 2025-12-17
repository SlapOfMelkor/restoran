# 🚀 ADIM ADIM KURULUM REHBERİ

Sunucuda projeyi çalışır hale getirmek için **TAM OLARAK BU SIRAYLA** yapın:

---

## ✅ ADIM 1: Environment Dosyasını Oluştur

```bash
cd ~/restoran

# Template'den kopyala
cp env.production.template .env.production

# Düzenle
nano .env.production
```

**Düzenlemeniz Gerekenler:**
1. `POSTGRES_PASSWORD` - Güçlü şifre oluşturun:
   ```bash
   openssl rand -base64 32
   ```
   Çıkan değeri `POSTGRES_PASSWORD=` satırına yapıştırın.

2. `DATABASE_DSN` içindeki `password=` kısmını yukarıdaki şifreyle değiştirin.

3. `JWT_SECRET` - Güçlü secret oluşturun:
   ```bash
   openssl rand -hex 64
   ```
   Çıkan değeri `JWT_SECRET=` satırına yapıştırın.

**Dosyayı kaydedin:** `Ctrl+X`, sonra `Y`, sonra `Enter`

```bash
# Dosya izinlerini ayarla
chmod 600 .env.production
```

---

## ✅ ADIM 2: Container'ları Başlat (İlk Aşama)

```bash
cd ~/restoran

# Tüm servisleri build et ve başlat
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

# Durumu kontrol et (tüm container'lar "Up" olmalı)
docker compose -f docker-compose.production.yml ps
```

**Beklenen:** 5 container çalışıyor olmalı:
- restoran-db
- restoran-backend
- restoran-frontend
- restoran-nginx-proxy
- restoran-certbot

---

## ✅ ADIM 3: SSL Sertifikası Al

```bash
cd ~/restoran

# Script'e izin ver
chmod +x scripts/setup-ssl-simple.sh

# SSL sertifikası al (email soracak)
./scripts/setup-ssl-simple.sh
```

**Email girin:** `mimarmuratdemir@gmail.com` (veya istediğiniz email)

**Script başarılı olursa:** Sertifika alındı mesajı göreceksiniz.

**Eğer script başarısız olursa veya manuel yapmak isterseniz:**

```bash
# Manuel SSL sertifikası al
docker compose -f docker-compose.production.yml --env-file .env.production run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email mimarmuratdemir@gmail.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d mimarmuratdemir.com \
  -d www.mimarmuratdemir.com
```

---

## ✅ ADIM 4: Nginx Konfigürasyonunu HTTPS'e Geçir

```bash
cd ~/restoran

# Nginx konfigürasyonunu düzenle
nano nginx/conf.d/default.conf
```

**HTTP server bloğunda (listen 80; kısmında):**

1. **Şu satırları SİLİN:**
   ```nginx
   # İlk kurulum için HTTP proxy
   location /api/ {
       proxy_pass http://backend:8080;
       ...
   }
   
   location / {
       proxy_pass http://frontend:80;
       ...
   }
   ```

2. **Şu satırı AKTİF EDİN (başındaki # işaretini kaldırın):**
   ```nginx
   # return 301 https://$host$request_uri;
   ```
   
   **Şöyle olmalı:**
   ```nginx
   return 301 https://$host$request_uri;
   ```

**Dosyayı kaydedin:** `Ctrl+X`, `Y`, `Enter`

```bash
# Nginx'i yeniden yükle
docker compose -f docker-compose.production.yml --env-file .env.production exec nginx-proxy nginx -s reload
```

---

## ✅ ADIM 5: Sistem Durumunu Kontrol Et

```bash
# Container'ların durumu
docker compose -f docker-compose.production.yml ps

# Logları kontrol et
docker compose -f docker-compose.production.yml --env-file .env.production logs backend
docker compose -f docker-compose.production.yml --env-file .env.production logs nginx-proxy

# SSL sertifikası kontrolü
docker compose -f docker-compose.production.yml exec nginx-proxy ls -la /etc/letsencrypt/live/mimarmuratdemir.com/
```

**Beklenen:** Sertifika dosyaları görünmeli (fullchain.pem, privkey.pem, chain.pem)

---

## ✅ ADIM 6: İlk Super Admin Oluştur

```bash
# Super admin oluştur
curl -X POST http://localhost/api/auth/register-super-admin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Super Admin",
    "email": "admin@mimarmuratdemir.com",
    "password": "GüçlüŞifre123!"
  }'
```

**Başarılı yanıt:**
```json
{
  "id": 1,
  "email": "admin@mimarmuratdemir.com",
  "role": "super_admin"
}
```

---

## ✅ ADIM 7: Test Et

1. **Tarayıcıdan:** `https://mimarmuratdemir.com`
2. **Login sayfası görünmeli**
3. **SSL sertifikası geçerli olmalı** (yeşil kilit ikonu)
4. **Super admin ile giriş yap:**
   - Email: `admin@mimarmuratdemir.com`
   - Şifre: `GüçlüŞifre123!` (veya oluştururken girdiğiniz şifre)

---

## 🛠️ Sorun Giderme

### Container'lar başlamıyor
```bash
docker compose -f docker-compose.production.yml --env-file .env.production logs
```

### SSL sertifikası alınamıyor
```bash
# DNS kontrolü
nslookup mimarmuratdemir.com

# Port kontrolü
sudo ufw status

# Nginx logları
docker compose -f docker-compose.production.yml --env-file .env.production logs nginx-proxy
```

### Super admin oluşturulamıyor
```bash
# Backend logları
docker compose -f docker-compose.production.yml --env-file .env.production logs backend
```

---

## 📝 ÖZET - Kopyala Yapıştır Komutları

```bash
# 1. Environment dosyası
cd ~/restoran
cp env.production.template .env.production
nano .env.production
# POSTGRES_PASSWORD, DATABASE_DSN password, JWT_SECRET değerlerini değiştir
chmod 600 .env.production

# 2. Container'ları başlat
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

# 3. SSL sertifikası
chmod +x scripts/setup-ssl-simple.sh
./scripts/setup-ssl-simple.sh

# 4. Nginx konfigürasyonunu düzenle (nano ile)
nano nginx/conf.d/default.conf
# HTTP proxy kısmını sil, redirect'i aktif et

# 5. Nginx'i yeniden yükle
docker compose -f docker-compose.production.yml --env-file .env.production exec nginx-proxy nginx -s reload

# 6. Super admin oluştur
curl -X POST http://localhost/api/auth/register-super-admin \
  -H "Content-Type: application/json" \
  -d '{"name": "Super Admin", "email": "admin@mimarmuratdemir.com", "password": "GüçlüŞifre123!"}'

# 7. Test
# Tarayıcıdan: https://mimarmuratdemir.com
```

---

**TAMAM! Artık sistem çalışıyor! 🎉**

