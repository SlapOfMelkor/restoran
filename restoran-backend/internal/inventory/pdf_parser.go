package inventory

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"restoran-backend/internal/database"
	"restoran-backend/internal/models"
)

// ParsedProduct: PDF'den çıkarılan ürün bilgisi
type ParsedProduct struct {
	StockCode    string  `json:"stock_code"`    // Stok Kodu (örn: TM0012)
	ProductName  string  `json:"product_name"`  // Ürün adı
	UnitPrice    float64 `json:"unit_price"`    // Birim fiyat (140.00)
	Quantity     float64 `json:"quantity"`      // Miktar (2)
	QuantityUnit string  `json:"quantity_unit"` // Miktar birimi (Paket, Adet, Kilogram)
	TotalAmount  float64 `json:"total_amount"`  // Toplam tutar (336.00)
	MatchedProductID *uint `json:"matched_product_id"` // Eşleşen ürün ID (nil ise eşleşme yok)
	MatchedProductName string `json:"matched_product_name"` // Eşleşen ürün adı
}

// ParsePDFResponse: PDF parsing sonucu
type ParsePDFResponse struct {
	Products    []ParsedProduct `json:"products"`
	Date        string          `json:"date"`        // Sipariş tarihi (varsa)
	OrderNumber string          `json:"order_number"` // Sipariş numarası (varsa)
}

// parseTurkishFloat: Türkçe formatındaki sayıyı float'a çevir (1.234,56 -> 1234.56)
func parseTurkishFloat(s string) (float64, error) {
	// Boşlukları ve "TL" gibi ekleri temizle
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "TL", "")
	s = strings.TrimSpace(s)
	
	// Binlik ayırıcı noktaları kaldır
	s = strings.ReplaceAll(s, ".", "")
	
	// Virgülü noktaya çevir (ondalık ayırıcı)
	s = strings.ReplaceAll(s, ",", ".")
	
	return strconv.ParseFloat(s, 64)
}

// extractQuantityAndUnit: "2 Paket", "1 Adet", "25 Adet", "1 Kilogram" gibi string'den miktar ve birim çıkar
func extractQuantityAndUnit(s string) (float64, string) {
	s = strings.TrimSpace(s)
	
	// Sayıyı bul
	var quantityStr strings.Builder
	var unitStr strings.Builder
	inQuantity := true
	
	for _, r := range s {
		if inQuantity && (unicode.IsDigit(r) || r == '.' || r == ',') {
			quantityStr.WriteRune(r)
		} else {
			inQuantity = false
			if !unicode.IsSpace(r) {
				unitStr.WriteRune(r)
			}
		}
	}
	
	quantityText := quantityStr.String()
	unitText := strings.TrimSpace(unitStr.String())
	
	// Türkçe formatındaki sayıyı parse et
	quantityText = strings.ReplaceAll(quantityText, ",", ".")
	quantity, err := strconv.ParseFloat(quantityText, 64)
	if err != nil {
		return 0, unitText
	}
	
	return quantity, unitText
}

// parsePDFTable: PDF text'inden tablo verilerini çıkar
func parsePDFTable(text string) ([]ParsedProduct, error) {
	var products []ParsedProduct
	
	// Tablo başlığını bul (Stok Kodu | Ürün | Birim Fiyat | Miktar | ...)
	// Tablo satırlarını bulmak için regex kullan
	// Her satır: Stok Kodu, Ürün adı, Birim Fiyat, Miktar, KDV Oranı, KDV Tutarı, Toplam Tutar
	
	lines := strings.Split(text, "\n")
	
	// Tablo başlığını bul
	tableStartIdx := -1
	for i, line := range lines {
		if strings.Contains(line, "Stok Kodu") && strings.Contains(line, "Ürün") {
			tableStartIdx = i
			break
		}
	}
	
	if tableStartIdx == -1 {
		return nil, fmt.Errorf("tablo başlığı bulunamadı")
	}
	
	// Tablo satırlarını işle (başlıktan sonraki satırlar)
	for i := tableStartIdx + 2; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		
		// Boş satırları ve toplam satırlarını atla
		if line == "" || strings.Contains(line, "Toplam:") || strings.Contains(line, "KDV:") || strings.Contains(line, "Genel Toplam:") {
			continue
		}
		
		// Tablo formatı: | Stok Kodu | Ürün | Birim Fiyat | Miktar | Kdv Oranı | Kdv Tutarı | Toplam Tutar |
		// Pipe karakterleriyle ayrılmış kolonlar
		if !strings.Contains(line, "|") {
			// Eğer satır pipe içermiyorsa, bir önceki satırın devamı olabilir (çok satırlı ürün adları için)
			if len(products) > 0 {
				// Son ürünün adına ekle
				lastProduct := &products[len(products)-1]
				if lastProduct.ProductName != "" {
					lastProduct.ProductName += " " + line
				}
			}
			continue
		}
		
		// Pipe karakterleriyle ayır
		parts := strings.Split(line, "|")
		if len(parts) < 8 { // En az 8 parça olmalı (boş başlangıç + 7 kolon + boş bitiş)
			// Çok satırlı ürün adları için özel işlem
			if len(products) > 0 {
				lastProduct := &products[len(products)-1]
				if lastProduct.ProductName != "" {
					// Bu satır muhtemelen ürün adının devamı
					cleaned := strings.TrimSpace(line)
					cleaned = strings.Trim(cleaned, "|")
					if cleaned != "" {
						lastProduct.ProductName += " " + cleaned
					}
				}
			}
			continue
		}
		
		// Kolonları çıkar (indeks 1'den başlar, 0 boş)
		stockCode := strings.TrimSpace(parts[1])
		productName := strings.TrimSpace(parts[2])
		unitPriceStr := strings.TrimSpace(parts[3])
		quantityStr := strings.TrimSpace(parts[4])
		totalAmountStr := strings.TrimSpace(parts[7])
		
		// Boş satırları atla
		if stockCode == "" && productName == "" {
			continue
		}
		
		// Stok kodu yoksa veya sadece boşluk varsa, bu satır muhtemelen önceki satırın devamı
		if stockCode == "" {
			if len(products) > 0 {
				lastProduct := &products[len(products)-1]
				if productName != "" {
					lastProduct.ProductName += " " + productName
				}
			}
			continue
		}
		
		// Birim fiyatı parse et
		unitPrice, err := parseTurkishFloat(unitPriceStr)
		if err != nil {
			continue // Parse edilemezse atla
		}
		
		// Miktar ve birim çıkar
		quantity, quantityUnit := extractQuantityAndUnit(quantityStr)
		
		// Toplam tutarı parse et
		totalAmount, err := parseTurkishFloat(totalAmountStr)
		if err != nil {
			continue // Parse edilemezse atla
		}
		
		product := ParsedProduct{
			StockCode:    stockCode,
			ProductName:  productName,
			UnitPrice:    unitPrice,
			Quantity:     quantity,
			QuantityUnit: quantityUnit,
			TotalAmount:  totalAmount,
		}
		
		products = append(products, product)
	}
	
	return products, nil
}

// matchProduct: Ürün adını ve stok kodunu sistemdeki ürünlerle eşleştir (fuzzy matching)
func matchProduct(productName string, stockCode string) (*models.Product, error) {
	productName = strings.TrimSpace(productName)
	stockCode = strings.TrimSpace(stockCode)
	
	// Önce stok koduna göre eşleştir (en güvenilir yöntem)
	if stockCode != "" {
		var product models.Product
		if err := database.DB.Where("stock_code = ?", stockCode).First(&product).Error; err == nil {
			return &product, nil
		}
	}
	
	// Stok kodu eşleşmediyse veya yoksa, isme göre eşleştir
	if productName == "" {
		return nil, nil
	}
	
	var products []models.Product
	if err := database.DB.Find(&products).Error; err != nil {
		return nil, err
	}
	
	// Normalize: küçük harfe çevir, Türkçe karakterleri düzelt
	normalize := func(s string) string {
		s = strings.ToLower(s)
		s = strings.ReplaceAll(s, "ı", "i")
		s = strings.ReplaceAll(s, "ğ", "g")
		s = strings.ReplaceAll(s, "ü", "u")
		s = strings.ReplaceAll(s, "ş", "s")
		s = strings.ReplaceAll(s, "ö", "o")
		s = strings.ReplaceAll(s, "ç", "c")
		return s
	}
	
	normalizedProductName := normalize(productName)
	
	// Önce tam eşleşme ara
	for _, p := range products {
		normalizedPName := normalize(p.Name)
		if normalizedPName == normalizedProductName {
			return &p, nil
		}
	}
	
	// Tam eşleşme yoksa, kısmi eşleşme ara (en uzun ortak substring)
	bestMatch := (*models.Product)(nil)
	bestScore := 0
	
	for _, p := range products {
		normalizedPName := normalize(p.Name)
		
		// Eğer PDF'deki ürün adı, sistemdeki ürün adını içeriyorsa veya tam tersi
		if strings.Contains(normalizedProductName, normalizedPName) || strings.Contains(normalizedPName, normalizedProductName) {
			score := len(normalizedPName)
			if score > bestScore {
				bestScore = score
				bestMatch = &p
			}
		}
	}
	
	// En az 5 karakterlik eşleşme olsun
	if bestScore >= 5 {
		return bestMatch, nil
	}
	
	return nil, nil // Eşleşme bulunamadı
}

// ExtractDateFromPDF: PDF text'inden sipariş tarihini çıkar
func extractDateFromPDF(text string) string {
	// "Sipariş Tarihi: 12.12.2025 18:19:58" formatını bul
	re := regexp.MustCompile(`Sipariş Tarihi:\s*(\d{2}\.\d{2}\.\d{4})`)
	matches := re.FindStringSubmatch(text)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

// ExtractOrderNumberFromPDF: PDF text'inden sipariş numarasını çıkar
func extractOrderNumberFromPDF(text string) string {
	// "No: A22A7ABE52039AA" formatını bul
	re := regexp.MustCompile(`No:\s*([A-Z0-9]+)`)
	matches := re.FindStringSubmatch(text)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

// ParseShipmentPDF: PDF dosyasını parse edip ürün bilgilerini çıkar
// NOT: Bu fonksiyon şu an için PDF'den direkt text extraction yapmıyor
// Frontend'den PDF text'i gönderilmesi bekleniyor veya daha sonra PDF parsing kütüphanesi eklenebilir
func ParseShipmentPDF(pdfData []byte) (*ParsePDFResponse, error) {
	// Şimdilik PDF'i string olarak kabul ediyoruz (frontend'den text gönderilecek)
	// Gelecekte gerçek PDF parsing eklenebilir
	fullText := string(pdfData)
	
	// Tarih ve sipariş numarasını çıkar
	date := extractDateFromPDF(fullText)
	orderNumber := extractOrderNumberFromPDF(fullText)
	
	// Tablo verilerini parse et
	products, err := parsePDFTable(fullText)
	if err != nil {
		return nil, fmt.Errorf("tablo parse edilemedi: %v", err)
	}
	
	// Her ürün için sistemdeki ürünlerle eşleştir
	for i := range products {
		matched, err := matchProduct(products[i].ProductName, products[i].StockCode)
		if err == nil && matched != nil {
			products[i].MatchedProductID = &matched.ID
			products[i].MatchedProductName = matched.Name
		}
	}
	
	return &ParsePDFResponse{
		Products:    products,
		Date:        date,
		OrderNumber: orderNumber,
	}, nil
}

