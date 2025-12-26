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

	// Ürün fotoğrafını bul
	// class="img-fluid product-img" olan img tag'ini bul
	// veya /ProductImages/ path'ine sahip img'leri bul
	
	var imageURL string
	
	// Önce "product-img" class'ına sahip img tag'ini ara
	productImgRe := regexp.MustCompile(`<img[^>]*class=["'][^"']*product-img[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>`)
	productImgMatch := productImgRe.FindStringSubmatch(htmlContent)
	
	if len(productImgMatch) > 1 {
		src := productImgMatch[1]
		
		// Tam URL oluştur
		if strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://") {
			imageURL = src
		} else if strings.HasPrefix(src, "/") {
			imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
		} else {
			imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
		}
	} else {
		// product-img class'ı yoksa, /ProductImages/ path'ine sahip img'leri ara
		productImagesRe := regexp.MustCompile(`<img[^>]+src=["'](/ProductImages/[^"']+)["'][^>]*>`)
		productImagesMatch := productImagesRe.FindStringSubmatch(htmlContent)
		
		if len(productImagesMatch) > 1 {
			src := productImagesMatch[1]
			
			// Tam URL oluştur
			if strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://") {
				imageURL = src
			} else if strings.HasPrefix(src, "/") {
				imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
			} else {
				imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
			}
		} else {
			// Son çare: tüm img'leri ara ama avatar, icon, logo gibi olmayanları filtrele
			imgRe := regexp.MustCompile(`<img[^>]+src=["']([^"']+)["'][^>]*>`)
			imgMatches := imgRe.FindAllStringSubmatch(htmlContent, -1)

			for _, match := range imgMatches {
				if len(match) < 2 {
					continue
				}
				src := match[1]

				// Placeholder, icon, logo, avatar gibi olmayan gerçek fotoğraf URL'ini bul
				srcLower := strings.ToLower(src)
				if strings.Contains(srcLower, "placeholder") ||
					strings.Contains(srcLower, "icon") ||
					strings.Contains(srcLower, "logo") ||
					strings.Contains(srcLower, "avatar") ||
					strings.Contains(srcLower, "user") ||
					strings.Contains(srcLower, "profile") {
					continue
				}

				// /ProductImages/ içerenleri tercih et
				if strings.Contains(src, "/ProductImages/") {
					if strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://") {
						imageURL = src
					} else if strings.HasPrefix(src, "/") {
						imageURL = fmt.Sprintf("https://b2b.cadininevi.com.tr%s", src)
					}
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

