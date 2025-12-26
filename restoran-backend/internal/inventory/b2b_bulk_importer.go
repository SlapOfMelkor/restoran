package inventory

import (
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"restoran-backend/internal/config"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"
)

// B2BProductInfo: B2B'den çekilen ürün bilgileri
type B2BProductInfo struct {
	StockCode string
	Name      string
	Category  string
	ImageURL  string
}

// ScrapeB2BProductPage: B2B ürün detay sayfasından bilgileri çeker
func ScrapeB2BProductPage(stockCode string) (*B2BProductInfo, error) {
	url := fmt.Sprintf("https://b2b.cadininevi.com.tr/Store/Detail/%s", stockCode)

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("HTTP isteği oluşturulamadı: %v", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP isteği başarısız: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP hatası: %d", resp.StatusCode)
	}

	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("HTML okunamadı: %v", err)
	}

	htmlContent := string(htmlBytes)

	// Sayfa başlığını kontrol et - hata sayfası mı?
	titleRe := regexp.MustCompile(`<title>(.*?)</title>`)
	titleMatch := titleRe.FindStringSubmatch(htmlContent)
	if len(titleMatch) > 1 {
		title := strings.TrimSpace(titleMatch[1])
		if strings.Contains(title, "HATA!") && strings.Contains(title, "Kodex B2B") {
			return nil, fmt.Errorf("ürün sayfası bulunamadı (HATA sayfası)")
		}
	}

	info := &B2BProductInfo{
		StockCode: stockCode,
	}

	// Ürün adını çek: /html/body/div[3]/div[3]/div[2]/div[2]/div[1]/div/div[2]/h4
	// "Ürün Detayı" başlığından sonraki ilk h4'ü bul (navigasyon/metinleri atlamak için)
	productDetailRe := regexp.MustCompile(`(?i)ürün\s+detayı`)
	detailIndex := productDetailRe.FindStringIndex(htmlContent)

	if detailIndex != nil {
		searchStart := detailIndex[0]
		// "Ürün Detayı" bölümünden sonraki 5000 karakteri al
		searchEnd := searchStart + 5000
		if searchEnd > len(htmlContent) {
			searchEnd = len(htmlContent)
		}
		searchContent := htmlContent[searchStart:searchEnd]

		// Bu bölümdeki ilk h4'ü bul
		h4Re := regexp.MustCompile(`<h4[^>]*>(.*?)</h4>`)
		h4Matches := h4Re.FindAllStringSubmatch(searchContent, -1)

		// Filtrelenmesi gereken metinler
		excludedWords := []string{
			"ürün detayı",
			"sepetim",
			"cadının evi",
			"hesabım",
			"çıkış",
			"ana sayfa",
			"sipariş",
			"ürünler",
			"cari hesabım",
			"ödeme yap",
		}

		for _, match := range h4Matches {
			if len(match) > 1 {
				name := strings.TrimSpace(cleanHTML(match[1]))

				// Filtreleme: En az 3 karakter, excluded words içermemeli
				if name != "" && len(name) > 2 {
					nameLower := strings.ToLower(name)
					excluded := false
					for _, word := range excludedWords {
						if strings.Contains(nameLower, word) {
							excluded = true
							break
						}
					}

					if !excluded {
						info.Name = name
						break
					}
				}
			}
		}
	}

	// Stok kodunu çek: /html/body/div[3]/div[3]/div[2]/div[2]/div[1]/div/div[2]/span[2]
	// "STK : TM0296" formatında olabilir
	stkRe := regexp.MustCompile(`STK\s*[:\-]?\s*([A-Z]{2}\d+)`)
	stkMatch := stkRe.FindStringSubmatch(htmlContent)
	if len(stkMatch) > 1 {
		info.StockCode = strings.TrimSpace(stkMatch[1])
	} else {
		// Eğer bulamazsak URL'den al
		info.StockCode = stockCode
	}

	// Kategoriyi çek: "Kategori : Ambalaj Grupları" formatında
	// "Ürün Detayı" bölümünden sonra ara
	categoryRe := regexp.MustCompile(`Kategori\s*[:\-]?\s*([^<\n\r]+)`)

	if detailIndex != nil {
		searchStart := detailIndex[0]
		searchEnd := searchStart + 3000
		if searchEnd > len(htmlContent) {
			searchEnd = len(htmlContent)
		}
		searchContent := htmlContent[searchStart:searchEnd]

		categoryMatch := categoryRe.FindStringSubmatch(searchContent)
		if len(categoryMatch) > 1 {
			category := strings.TrimSpace(cleanHTML(categoryMatch[1]))
			// HTML tag'lerini ve gereksiz karakterleri temizle
			category = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(category, "")
			category = regexp.MustCompile(`-->.*$`).ReplaceAllString(category, "") // "--> ..." kısmını kaldır
			category = regexp.MustCompile(`\s+`).ReplaceAllString(category, " ")   // Çoklu boşlukları tek boşluğa çevir
			category = strings.TrimSpace(category)

			// Gereksiz metinleri filtrele
			if category != "" && !strings.Contains(strings.ToLower(category), "listesi buraya") {
				info.Category = category
			}
		}
	}

	// Fotoğraf URL'ini çek: Sadece /ProductImages/STOKKODU/... formatındaki img'leri çek
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

	// Bulunan URL'yi info'ya kaydet
	if imageURL != "" {
		info.ImageURL = imageURL
	}

	// Validasyon: En azından isim ve stok kodu olmalı
	if info.Name == "" {
		return nil, fmt.Errorf("ürün adı bulunamadı")
	}
	if info.StockCode == "" {
		return nil, fmt.Errorf("stok kodu bulunamadı")
	}

	return info, nil
}

// cleanHTML: HTML tag'lerini temizler ve entity'leri decode eder
func cleanHTML(htmlContent string) string {
	// HTML tag'lerini kaldır
	tagRe := regexp.MustCompile(`<[^>]+>`)
	cleaned := tagRe.ReplaceAllString(htmlContent, "")

	// HTML entity'lerini decode et (Go'nun html paketi kullanarak)
	// Önce standart entity'leri decode et
	cleaned = html.UnescapeString(cleaned)

	// Hex kodlu entity'leri manuel olarak decode et (Go'nun html paketi bazılarını decode etmeyebilir)
	// &#x130; = İ (büyük i noktalı)
	cleaned = regexp.MustCompile(`&#x130;`).ReplaceAllString(cleaned, "İ")
	// &#x131; = ı (küçük i noktasız)
	cleaned = regexp.MustCompile(`&#x131;`).ReplaceAllString(cleaned, "ı")
	// &#x15E; = Ş (büyük ş)
	cleaned = regexp.MustCompile(`&#x15E;`).ReplaceAllString(cleaned, "Ş")
	// &#x15F; = ş (küçük ş)
	cleaned = regexp.MustCompile(`&#x15F;`).ReplaceAllString(cleaned, "ş")
	// &#xC7; = Ç (büyük ç)
	cleaned = regexp.MustCompile(`&#xC7;`).ReplaceAllString(cleaned, "Ç")
	// &#xE7; = ç (küçük ç)
	cleaned = regexp.MustCompile(`&#xE7;`).ReplaceAllString(cleaned, "ç")
	// &#xD6; = Ö (büyük ö)
	cleaned = regexp.MustCompile(`&#xD6;`).ReplaceAllString(cleaned, "Ö")
	// &#xF6; = ö (küçük ö)
	cleaned = regexp.MustCompile(`&#xF6;`).ReplaceAllString(cleaned, "ö")
	// &#xDC; = Ü (büyük ü)
	cleaned = regexp.MustCompile(`&#xDC;`).ReplaceAllString(cleaned, "Ü")
	// &#xFC; = ü (küçük ü)
	cleaned = regexp.MustCompile(`&#xFC;`).ReplaceAllString(cleaned, "ü")
	// &#xC4; = Ä (genelde Türkçe'de kullanılmaz ama decode edelim)
	cleaned = regexp.MustCompile(`&#xC4;`).ReplaceAllString(cleaned, "Ä")
	// &#xE4; = ä
	cleaned = regexp.MustCompile(`&#xE4;`).ReplaceAllString(cleaned, "ä")
	// &#x11E; = Ğ (büyük ğ)
	cleaned = regexp.MustCompile(`&#x11E;`).ReplaceAllString(cleaned, "Ğ")
	// &#x11F; = ğ (küçük ğ)
	cleaned = regexp.MustCompile(`&#x11F;`).ReplaceAllString(cleaned, "ğ")

	// Kalan hex entity'leri genel regex ile decode et (diğer karakterler için)
	hexEntityRe := regexp.MustCompile(`&#x([0-9A-Fa-f]+);`)
	cleaned = hexEntityRe.ReplaceAllStringFunc(cleaned, func(match string) string {
		// Hex kodu çıkar
		hexCode := hexEntityRe.FindStringSubmatch(match)
		if len(hexCode) > 1 {
			// Hex string'i integer'a çevir ve rune'a dönüştür
			var code int
			if _, err := fmt.Sscanf(hexCode[1], "%x", &code); err == nil {
				return string(rune(code))
			}
		}
		return match
	})

	// Decimal entity'leri de decode et
	decimalEntityRe := regexp.MustCompile(`&#(\d+);`)
	cleaned = decimalEntityRe.ReplaceAllStringFunc(cleaned, func(match string) string {
		decimalCode := decimalEntityRe.FindStringSubmatch(match)
		if len(decimalCode) > 1 {
			var code int
			if _, err := fmt.Sscanf(decimalCode[1], "%d", &code); err == nil {
				return string(rune(code))
			}
		}
		return match
	})

	// Boşlukları normalize et
	cleaned = strings.ReplaceAll(cleaned, "&nbsp;", " ")
	cleaned = regexp.MustCompile(`\s+`).ReplaceAllString(cleaned, " ")

	return strings.TrimSpace(cleaned)
}

// BulkImportB2BProducts: B2B sisteminden tüm ürünleri toplu olarak içe aktarır
// cancelChan: İşlemi iptal etmek için channel (nil olabilir)
func BulkImportB2BProducts(cfg *config.Config, prefix string, startNum int, endNum int, delayMs int, cancelChan <-chan struct{}) (int, int, []string, bool) {
	imported := 0
	skipped := 0
	errors := make([]string, 0)
	total := endNum - startNum + 1

	log.Printf("Bulk import başladı: %s%04d-%s%04d (toplam %d ürün)", prefix, startNum, prefix, endNum, total)

	for num := startNum; num <= endNum; num++ {
		// Cancellation kontrolü
		if cancelChan != nil {
			select {
			case <-cancelChan:
				log.Printf("Bulk import iptal edildi: %d imported, %d skipped", imported, skipped)
				return imported, skipped, errors, true
			default:
				// Devam et
			}
		}
		// Stock code oluştur (örn: TM0001, CD0123)
		stockCode := fmt.Sprintf("%s%04d", prefix, num)

		// Her 100 üründe bir ilerleme log'u
		if (num-startNum+1)%100 == 0 || num == startNum || num == endNum {
			progress := float64(num-startNum+1) / float64(total) * 100
			log.Printf("İlerleme: %d/%d (%.1f%%) - Imported: %d, Skipped: %d", num-startNum+1, total, progress, imported, skipped)
		}

		// Önce veritabanında kontrol et (isim veya stok kodu ile)
		var existingByName models.Product
		var existingByStockCode models.Product

		db := database.DB

		// Cancellation kontrolü - HTTP request'ten önce
		if cancelChan != nil {
			select {
			case <-cancelChan:
				log.Printf("Bulk import iptal edildi (scrape öncesi): %d imported, %d skipped", imported, skipped)
				return imported, skipped, errors, true
			default:
				// Devam et
			}
		}

		// Sayfayı scrape et
		productInfo, err := ScrapeB2BProductPage(stockCode)
		if err != nil {
			// Hata sayfası veya ürün yok - skip (log'lamıyoruz, çok fazla olur)
			skipped++
			continue
		}

		// Cancellation kontrolü - scrape sonrası
		if cancelChan != nil {
			select {
			case <-cancelChan:
				log.Printf("Bulk import iptal edildi (scrape sonrası): %d imported, %d skipped", imported, skipped)
				return imported, skipped, errors, true
			default:
				// Devam et
			}
		}

		// Şimdi veritabanında kontrol et
		// İsim kontrolü
		if err := db.Where("name = ?", productInfo.Name).First(&existingByName).Error; err == nil {
			// İsim zaten var, skip
			skipped++
			continue
		}

		// Stok kodu kontrolü
		if err := db.Where("stock_code = ?", productInfo.StockCode).First(&existingByStockCode).Error; err == nil {
			// Stok kodu zaten var, skip
			skipped++
			continue
		}

		// Yeni ürün oluştur
		product := models.Product{
			Name:            productInfo.Name,
			Unit:            "adet", // Hepsi adet olarak kaydedilecek
			StockCode:       productInfo.StockCode,
			Category:        productInfo.Category,
			IsCenterProduct: true,
		}

		if err := db.Create(&product).Error; err != nil {
			errMsg := fmt.Sprintf("%s: Veritabanı hatası - %v", stockCode, err)
			errors = append(errors, errMsg)
			log.Printf("HATA: %s", errMsg)
			skipped++
			continue
		}

		log.Printf("Ürün eklendi: %s - %s", stockCode, productInfo.Name)

		// Cancellation kontrolü - fotoğraf indirmeden önce
		if cancelChan != nil {
			select {
			case <-cancelChan:
				log.Printf("Bulk import iptal edildi (fotoğraf indirme öncesi): %d imported, %d skipped", imported, skipped)
				return imported, skipped, errors, true
			default:
				// Devam et
			}
		}

		// Fotoğrafı indir (eğer varsa)
		if productInfo.ImageURL != "" {
			_, err := downloadImageFromURL(productInfo.ImageURL, productInfo.StockCode, cfg.ProductImagePath)
			if err != nil {
				// Fotoğraf indirme hatası kritik değil, log'la ama devam et
				errMsg := fmt.Sprintf("%s: Fotoğraf indirilemedi - %v", stockCode, err)
				errors = append(errors, errMsg)
				log.Printf("UYARI: %s", errMsg)
			} else {
				log.Printf("Fotoğraf indirildi: %s.jpg", stockCode)
			}
		} else {
			// Fotoğraf yoksa DownloadProductImage fonksiyonunu dene (eski yöntem)
			_, err := DownloadProductImage(productInfo.StockCode, cfg.ProductImagePath)
			if err != nil {
				// Fotoğraf yok, kritik değil (log'lamıyoruz)
			} else {
				log.Printf("Fotoğraf indirildi (eski yöntem): %s.jpg", stockCode)
			}
		}

		imported++

		// Rate limiting - delay ekle (cancellation ile)
		if delayMs > 0 {
			if cancelChan != nil {
				select {
				case <-cancelChan:
					log.Printf("Bulk import iptal edildi (delay sırasında): %d imported, %d skipped", imported, skipped)
					return imported, skipped, errors, true
				case <-time.After(time.Duration(delayMs) * time.Millisecond):
					// Delay tamamlandı, devam et
				}
			} else {
				time.Sleep(time.Duration(delayMs) * time.Millisecond)
			}
		}
	}

	log.Printf("Bulk import tamamlandı: %d imported, %d skipped, %d errors", imported, skipped, len(errors))
	return imported, skipped, errors, false
}

// downloadImageFromURL: Belirli bir URL'den resim indirir
func downloadImageFromURL(imageURL string, stockCode string, savePath string) (string, error) {
	if imageURL == "" || stockCode == "" {
		return "", fmt.Errorf("resim URL veya stok kodu boş")
	}

	// Dosya yolu ve adını belirle
	fileName := fmt.Sprintf("%s.jpg", stockCode)
	filePath := filepath.Join(savePath, fileName)

	// Fotoğraf zaten varsa indirme yapma
	if _, err := os.Stat(filePath); err == nil {
		return filePath, nil
	}

	// HTTP client oluştur
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", imageURL, nil)
	if err != nil {
		return "", fmt.Errorf("HTTP isteği oluşturulamadı: %v", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	// Resmi indir
	imageResp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("resim indirilemedi: %v", err)
	}
	defer imageResp.Body.Close()

	if imageResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("resim indirme hatası: %d", imageResp.StatusCode)
	}

	// Klasörü oluştur (yoksa)
	if err := os.MkdirAll(savePath, 0755); err != nil {
		return "", fmt.Errorf("klasör oluşturulamadı: %v", err)
	}

	// Dosyayı oluştur
	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("dosya oluşturulamadı: %v", err)
	}
	defer file.Close()

	// Resmi dosyaya yaz
	_, err = io.Copy(file, imageResp.Body)
	if err != nil {
		return "", fmt.Errorf("resim yazılamadı: %v", err)
	}

	return filePath, nil
}
