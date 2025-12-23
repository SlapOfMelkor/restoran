package config

import (
	"log"
	"os"
)

type Config struct {
	HTTPPort       string
	DatabaseDSN    string
	JWTSecret      string
	CORSOrigins    string
	ProductImagePath string // Ürün fotoğraflarının kaydedileceği klasör yolu
}

func Load() *Config {
	cfg := &Config{
		HTTPPort:        getEnv("HTTP_PORT", "8080"),
		DatabaseDSN:     getEnv("DATABASE_DSN", "host=localhost user=postgres password=postgres dbname=restoran port=5432 sslmode=disable"),
		JWTSecret:       getEnv("JWT_SECRET", ""),
		CORSOrigins:     getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173"),
		ProductImagePath: getEnv("PRODUCT_IMAGE_PATH", "./product-images"), // Default: local development için
	}

	// Production güvenlik kontrolleri
	if cfg.JWTSecret == "" {
		log.Fatal("[FATAL] JWT_SECRET environment değişkeni tanımlanmamış! Production için zorunludur.")
	}
	if len(cfg.JWTSecret) < 32 {
		log.Fatal("[FATAL] JWT_SECRET en az 32 karakter olmalıdır! Güvenlik riski.")
	}
	if cfg.DatabaseDSN == "host=localhost user=postgres password=postgres dbname=restoran port=5432 sslmode=disable" {
		log.Println("[WARN] DATABASE_DSN varsayılan değer kullanılıyor, production için mutlaka kendi Postgres bağlantı bilgisini tanımla.")
	}
	if cfg.CORSOrigins == "http://localhost:5173" {
		log.Println("[WARN] CORS_ALLOWED_ORIGINS varsayılan değer kullanılıyor, production için mutlaka kendi domain'ini tanımla.")
	}

	return cfg
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
