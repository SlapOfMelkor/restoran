# 🚀 Sunucu Kurulum Adımları - Hızlı Başlangıç

Bu rehber, sunucuya pull edilmiş projeyi çalışır hale getirmek için adım adım talimatlar içerir.

---

## 📋 Ön Gereksinimler

- ✅ Proje sunucuya pull edilmiş (`git pull` veya `git clone` yapılmış)
- ✅ Docker ve Docker Compose kurulu
- ✅ Domain DNS'i VPS IP'ye yönlendirilmiş
- ✅ Port 80 ve 443 açık

---

## 🔧 ADIM 1: Environment Dosyasını Oluştur

```bash
cd ~/restoran

# Template'den kopyala
cp env.production.template .env.production

# Dosyayı düzenle
nano .env.production
```

### Düzenlemeniz Gereken Değerler:

1. **POSTGRES_PASSWORD** - Güçlü bir şifre oluşturun:
   ```bash
   openssl rand -base64 32
   ```

2. **DATABASE_DSN** içindeki `password=` kısmını yukarıdaki şifreyle değiştirin

3. **JWT_SECRET** - Güçlü bir secret oluşturun:
   ```bash
   openssl rand -hex 64
   ```

**Örnek .env.production:**
```bash
POSTGRES_DB=Melkorrestoran
POSTGRES_USER=Melkor
POSTGRES_PASSWORD=GüçlüŞifre123!@#xyz789

DATABASE_DSN=host=db user=Melkor password=GüçlüŞifre123!@#xyz789 dbname=Melkorrestoran port=5432 sslmode=disable TimeZone=Europe/Istanbul

JWT_SECRET=a1b2c3d4e5f6...64karakterlikhexstring

CORS_ALLOWED_ORIGINS=https://mimarmuratdemir.com
HTTP_PORT=8080
VITE_API_BASE_URL=https://mimarmuratdemir.com/api
```

### Dosya İzinlerini Ayarla:

```bash
chmod 600 .env.production  # Sadece sen okuyabilsin
```

---

## 🐳 ADIM 2: Docker Container'larını Başlat (İlk Aşama - HTTP)

```bash
cd ~/restoran

# Tüm servisleri build et ve başlat (HTTP-only modda)
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

# Durumu kontrol et
docker compose -f docker-compose.production.yml ps
```

**Beklenen çıktı:** Tüm container'lar `Up` durumunda olmalı:
- `restoran-db` (PostgreSQL)
- `restoran-backend` (Go API)
- `restoran-frontend` (React)
- `restoran-nginx-proxy` (Nginx)
- `restoran-certbot` (SSL)

---

## 🔒 ADIM 3: SSL Sertifikası Al

### 3.1. Script'lere İzin Ver

```bash
chmod +x scripts/setup-ssl-simple.sh
chmod +x scripts/renew-cert.sh
```

### 3.2. SSL Sertifikası Al

```bash
./scripts/setup-ssl-simple.sh
```

Script size email adresinizi soracak. Let's Encrypt için geçerli bir email girin (örn: `admin@mimarmuratdemir.com`).

**Script otomatik olarak:**
1. Nginx'i HTTP-only modda başlatır
2. Let's Encrypt sertifikası alır
3. Nginx konfigürasyonunu HTTPS'e geçirir
4. Nginx'i yeniden yükler

### 3.3. Nginx Konfigürasyonunu Manuel Düzenle (Gerekirse)

Eğer script başarısız olursa, manuel olarak düzenleyin:

```bash
nano nginx/conf.d/default.conf
```

**HTTP server bloğunda:**
- Proxy location'ları (`location /api/` ve `location /`) kaldırın
- `# return 301 https://$host$request_uri;` satırını aktif edin (başındaki `#` işaretini kaldırın)

Sonra Nginx'i yeniden yükleyin:
```bash
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload
```

---

## ✅ ADIM 4: Sistem Durumunu Kontrol Et

```bash
# Tüm container'ların durumu
docker compose -f docker-compose.production.yml ps

# Logları kontrol et
docker compose -f docker-compose.production.yml logs backend
docker compose -f docker-compose.production.yml logs frontend
docker compose -f docker-compose.production.yml logs nginx-proxy

# SSL sertifikası kontrolü
docker compose -f docker-compose.production.yml exec nginx-proxy ls -la /etc/letsencrypt/live/mimarmuratdemir.com/
```

**Beklenen:** Sertifika dosyaları görünmeli:
- `fullchain.pem`
- `privkey.pem`
- `chain.pem`

---

## 👤 ADIM 5: İlk Super Admin Oluştur

```bash
# Direkt curl ile (sunucudan)
curl -X POST http://localhost/api/auth/register-super-admin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Super Admin",
    "email": "admin@mimarmuratdemir.com",
    "password": "GüçlüŞifre123!"
  }'
```

**VEYA HTTPS üzerinden (SSL kurulumundan sonra):**

```bash
curl -X POST https://mimarmuratdemir.com/api/auth/register-super-admin \
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

## 🧪 ADIM 6: Test Et

1. **Tarayıcıdan test:**
   - `https://mimarmuratdemir.com` adresine gidin
   - Login sayfası görünmeli
   - SSL sertifikası geçerli olmalı (yeşil kilit ikonu)

2. **API testi:**
   ```bash
   curl https://mimarmuratdemir.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@mimarmuratdemir.com",
       "password": "GüçlüŞifre123!"
     }'
   ```

3. **Super admin ile giriş yap:**
   - Email: `admin@mimarmuratdemir.com`
   - Şifre: `GüçlüŞifre123!` (veya oluştururken girdiğiniz şifre)
   - Dashboard açılmalı

---

## 🛠️ Sorun Giderme

### Container'lar Başlamıyor

```bash
# Logları kontrol et
docker compose -f docker-compose.production.yml logs

# Belirli bir servis
docker compose -f docker-compose.production.yml logs backend
docker compose -f docker-compose.production.yml logs db
```

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

### Database Bağlantı Hatası

```bash
# Database container'ının çalıştığını kontrol et
docker compose -f docker-compose.production.yml ps db

# Database logları
docker compose -f docker-compose.production.yml logs db

# .env.production'daki DATABASE_DSN'i kontrol et
cat .env.production | grep DATABASE_DSN
```

### Super Admin Oluşturulamıyor

```bash
# Backend loglarını kontrol et
docker compose -f docker-compose.production.yml logs backend

# Zaten bir super admin var mı kontrol et
docker compose -f docker-compose.production.yml exec db psql -U Melkor -d Melkorrestoran -c "SELECT * FROM users WHERE role = 'super_admin';"
```

---

## 📝 Önemli Notlar

1. **İlk Kurulum:** İlk kurulumda sistem HTTP-only modda başlar. SSL sertifikası alındıktan sonra HTTPS'e geçer.

2. **Super Admin:** Sadece bir tane super admin oluşturulabilir. İkinci bir super admin oluşturmaya çalışırsanız hata alırsınız.

3. **SSL Yenileme:** Certbot container'ı otomatik olarak sertifikaları yeniler (her 12 saatte bir kontrol).

4. **Environment Dosyası:** `.env.production` dosyası asla git'e commit edilmemelidir. Sadece sunucuda olmalı.

5. **Güvenlik:** 
   - Güçlü şifreler kullanın
   - `.env.production` dosyası sadece sahibi tarafından okunabilir olmalı (`chmod 600`)

---

## ✅ Kurulum Tamamlandı!

Sistem çalışır durumda. Artık:
- ✅ HTTPS aktif
- ✅ Backend API çalışıyor
- ✅ Frontend erişilebilir
- ✅ Database bağlantısı kuruldu
- ✅ Super admin oluşturuldu

**Sonraki Adımlar:**
- Tarayıcıdan `https://mimarmuratdemir.com` adresine gidin
- Super admin ile giriş yapın
- Şube ve kullanıcı yönetimine başlayın

---

**Sorun yaşarsanız:** Logları kontrol edin ve yukarıdaki sorun giderme bölümüne bakın.

**Son Güncelleme:** 2024

