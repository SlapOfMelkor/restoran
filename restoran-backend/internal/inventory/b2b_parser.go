package inventory

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// ParseB2BOrderURL: B2B sisteminden sipariş bilgilerini çeker
func ParseB2BOrderURL(url string) (*ParsePDFResponse, error) {
	// HTTP isteği yap
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("HTTP isteği oluşturulamadı: %v", err)
	}
	
	// User-Agent ekle (bazı siteler bot isteklerini engeller)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP isteği başarısız: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP hatası: %d", resp.StatusCode)
	}
	
	// HTML içeriğini oku
	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("HTML okunamadı: %v", err)
	}
	
	html := string(htmlBytes)
	
	// Sipariş numarasını çıkar: "No:CB22901AC48C501"
	orderNumberRe := regexp.MustCompile(`No:\s*([A-Z0-9]+)`)
	orderNumberMatch := orderNumberRe.FindStringSubmatch(html)
	orderNumber := ""
	if len(orderNumberMatch) > 1 {
		orderNumber = orderNumberMatch[1]
	}
	
	// Tarihi çıkar: "Sipariş Tarihi: 18.04.2025 14:25:06"
	dateRe := regexp.MustCompile(`Sipariş Tarihi:\s*(\d{2})\.(\d{2})\.(\d{4})`)
	dateMatch := dateRe.FindStringSubmatch(html)
	dateStr := ""
	if len(dateMatch) > 3 {
		// "18.04.2025" formatından "2025-04-18" formatına çevir
		dateStr = fmt.Sprintf("%s-%s-%s", dateMatch[3], dateMatch[2], dateMatch[1])
	}
	
	// Tablo içeriğini bul
	// Tablo formatı: <table> içinde <tr> satırları
	tableRe := regexp.MustCompile(`<table[^>]*>([\s\S]*?)</table>`)
	tableMatches := tableRe.FindAllStringSubmatch(html, -1)
	
	var products []ParsedProduct
	
	// Her tabloyu kontrol et (ürün tablosunu bul)
	for _, tableMatch := range tableMatches {
		if len(tableMatch) < 2 {
			continue
		}
		
		tableContent := tableMatch[1]
		
		// Tablo başlığını kontrol et (Stok Kodu, Ürün, Birim Fiyat vb. içeriyorsa)
		if !strings.Contains(tableContent, "Stok Kodu") && !strings.Contains(tableContent, "Ürün") {
			continue
		}
		
		// Satırları bul: <tr>...</tr>
		rowRe := regexp.MustCompile(`<tr[^>]*>([\s\S]*?)</tr>`)
		rows := rowRe.FindAllStringSubmatch(tableContent, -1)
		
		// İlk satır başlık, sonrakiler veri
		for i, rowMatch := range rows {
			if len(rowMatch) < 2 {
				continue
			}
			
			rowContent := rowMatch[1]
			
			// Başlık satırını atla
			if i == 0 {
				continue
			}
			
			// Toplam satırlarını atla
			if strings.Contains(rowContent, "Toplam:") || 
			   strings.Contains(rowContent, "KDV:") || 
			   strings.Contains(rowContent, "Genel Toplam:") {
				continue
			}
			
			// Hücreleri bul: <td>...</td>
			cellRe := regexp.MustCompile(`<td[^>]*>([\s\S]*?)</td>`)
			cells := cellRe.FindAllStringSubmatch(rowContent, -1)
			
			if len(cells) < 7 {
				continue // Yeterli kolon yok
			}
			
			// HTML etiketlerini temizle
			cleanHTML := func(s string) string {
				// HTML etiketlerini kaldır
				htmlTagRe := regexp.MustCompile(`<[^>]+>`)
				s = htmlTagRe.ReplaceAllString(s, "")
				// HTML entity'leri decode et
				s = strings.ReplaceAll(s, "&nbsp;", " ")
				s = strings.ReplaceAll(s, "&amp;", "&")
				s = strings.ReplaceAll(s, "&lt;", "<")
				s = strings.ReplaceAll(s, "&gt;", ">")
				s = strings.ReplaceAll(s, "&quot;", "\"")
				s = strings.ReplaceAll(s, "&#39;", "'")
				// Fazla boşlukları temizle
				s = strings.TrimSpace(s)
				s = regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
				return s
			}
			
			stockCode := cleanHTML(cells[0][1])
			productName := cleanHTML(cells[1][1])
			unitPriceStr := cleanHTML(cells[2][1])
			quantityStr := cleanHTML(cells[3][1])
			totalAmountStr := cleanHTML(cells[5][1]) // Toplam Tutar kolonu
			
			// Boş satırları atla
			if stockCode == "" && productName == "" {
				continue
			}
			
			// Birim fiyatı parse et (1.190,00 TL -> 1190.00)
			unitPrice, err := parseTurkishFloat(unitPriceStr)
			if err != nil {
				continue
			}
			
			// Miktar ve birim çıkar ("3 Paket" -> quantity=3, unit="Paket")
			quantity, quantityUnit := extractQuantityAndUnit(quantityStr)
			
			// Toplam tutarı parse et
			totalAmount, err := parseTurkishFloat(totalAmountStr)
			if err != nil {
				continue
			}
			
			product := ParsedProduct{
				StockCode:    stockCode,
				ProductName:  productName,
				UnitPrice:    unitPrice,
				Quantity:     quantity,
				QuantityUnit: quantityUnit,
				TotalAmount:  totalAmount,
			}
			
			// Ürünü sistemdeki ürünlerle eşleştir
			matched, err := matchProduct(productName, stockCode)
			if err == nil && matched != nil {
				product.MatchedProductID = &matched.ID
				product.MatchedProductName = matched.Name
			}
			
			products = append(products, product)
		}
	}
	
	if len(products) == 0 {
		return nil, fmt.Errorf("ürün bulunamadı. HTML formatı beklenen formatta olmayabilir")
	}
	
	return &ParsePDFResponse{
		Products:    products,
		Date:        dateStr,
		OrderNumber: orderNumber,
	}, nil
}

