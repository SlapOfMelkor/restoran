package inventory

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// DownloadProductImage: B2B sisteminden ürün fotoğrafını indirir
// stockCode: Ürün stok kodu (örn: TM0433)
// savePath: Fotoğrafın kaydedileceği klasör yolu (örn: /app/product-images veya ./public/product-images)
// Returns: Kaydedilen dosya yolu ve hata
func DownloadProductImage(stockCode string, savePath string) (string, error) {
	if stockCode == "" {
		return "", fmt.Errorf("stok kodu boş olamaz")
	}

	// Dosya yolu ve adını belirle
	fileName := fmt.Sprintf("%s.jpg", stockCode)
	filePath := filepath.Join(savePath, fileName)

	// Fotoğraf zaten varsa indirme yapma (dosya kontrolünü en başta yap)
	// os.Stat dosya varsa nil, yoksa err döndürür - klasör olmasa da çalışır
	if _, err := os.Stat(filePath); err == nil {
		// Dosya mevcut, indirme yapma
		return filePath, nil
	}

	// B2B ürün detay sayfası URL'i
	productDetailURL := fmt.Sprintf("https://b2b.cadininevi.com.tr/Store/Detail/%s", stockCode)

	// HTTP client oluştur
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", productDetailURL, nil)
	if err != nil {
		return "", fmt.Errorf("HTTP isteği oluşturulamadı: %v", err)
	}

	// User-Agent ekle
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	// HTML sayfasını çek
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP isteği başarısız: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP hatası: %d", resp.StatusCode)
	}

	// HTML içeriğini oku
	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("HTML okunamadı: %v", err)
	}

	htmlContent := string(htmlBytes)

	// Ürün fotoğrafını bul: Sadece /ProductImages/STOKKODU/... formatındaki img'leri çek
	var imageURL string
	
	// Önce product-img class'ına sahip img'leri ara (en güvenilir)
	productImgRe := regexp.MustCompile(`<img[^>]*class=["'][^"']*product-img[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>`)
	productImgMatches := productImgRe.FindAllStringSubmatch(htmlContent, -1)
	
	for _, match := range productImgMatches {
		if len(match) > 1 {
			src := match[1]
			// /ProductImages/ ile başlayan ve stok kodunu içeren path'i kontrol et
			if strings.HasPrefix(src, "/ProductImages/") && strings.Contains(src, stockCode) {
				imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
				break
			}
		}
	}
	
	// Eğer product-img class'ı bulunamadıysa, /ProductImages/STOKKODU/ formatındaki img'leri ara
	if imageURL == "" {
		// /ProductImages/STOKKODU/... formatını doğrudan ara
		productImagesPattern := fmt.Sprintf(`/ProductImages/%s/[^"']+`, regexp.QuoteMeta(stockCode))
		productImagesRe := regexp.MustCompile(`<img[^>]+src=["'](` + productImagesPattern + `)["'][^>]*>`)
		productImagesMatches := productImagesRe.FindAllStringSubmatch(htmlContent, -1)
		
		for _, match := range productImagesMatches {
			if len(match) > 1 {
				src := match[1]
				if strings.HasPrefix(src, "/ProductImages/") {
					imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
					break
				}
			}
		}
	}

	if imageURL == "" {
		return "", fmt.Errorf("ürün fotoğrafı bulunamadı")
	}

	// Fotoğrafı indir
	imageResp, err := client.Get(imageURL)
	if err != nil {
		return "", fmt.Errorf("fotoğraf indirilemedi: %v", err)
	}
	defer imageResp.Body.Close()

	if imageResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fotoğraf indirme hatası: %d", imageResp.StatusCode)
	}

	// Klasörü oluştur (yoksa) - indirmeden önce klasörü oluştur
	if err := os.MkdirAll(savePath, 0755); err != nil {
		return "", fmt.Errorf("klasör oluşturulamadı: %v", err)
	}

	// Dosyayı oluştur (zaten kontrol ettik, dosya yoksa buraya geliriz)
	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("dosya oluşturulamadı: %v", err)
	}
	defer file.Close()

	// Fotoğrafı dosyaya yaz
	_, err = io.Copy(file, imageResp.Body)
	if err != nil {
		return "", fmt.Errorf("fotoğraf yazılamadı: %v", err)
	}

	return filePath, nil
}

