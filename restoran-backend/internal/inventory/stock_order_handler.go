package inventory

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"

	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
)

// normalizeTurkish: Türkçe karakterleri ASCII karşılıklarına çevirir
// Örn: "CADI SÜTLÜ ÇİKOLATA" -> "CADI SUTLU CIKOLATA"
func normalizeTurkish(s string) string {
	replacements := map[rune]string{
		'ç': "c", 'Ç': "C",
		'ğ': "g", 'Ğ': "G",
		'ı': "i", 'İ': "I",
		'ö': "o", 'Ö': "O",
		'ş': "s", 'Ş': "S",
		'ü': "u", 'Ü': "U",
	}

	var result strings.Builder
	for _, r := range s {
		if replacement, ok := replacements[r]; ok {
			result.WriteString(replacement)
		} else {
			result.WriteRune(r)
		}
	}
	return strings.ToLower(result.String())
}

// normalizeProductName: Ürün adını normalleştirir - miktar bilgilerini (1KG, 500GR vb.) kaldırır
// Örn: "BEYAZ ANTEP FISTIKLI KIRMA ÇİKOLATA 1KG" -> "beyaz antep fistikli kirma cikolata"
// Örn: "beyaz antep fıstıklı kırma çikolata" -> "beyaz antep fistikli kirma cikolata"
func normalizeProductName(s string) string {
	// Önce Türkçe karakterleri normalize et
	normalized := normalizeTurkish(s)

	// Sonundaki miktar bilgilerini kaldır (regex ile)
	// Pattern: boşluk + sayı + birim (kg/gr/lt/ml/g/l ile biten)
	// Örnekler: " 1KG", " 500GR", " 2.5LT", " 250ML", " 1 G", " 500 L"
	quantityPattern := `\s+[\d.,]+?\s*(?:kg|gr|lt|ml|g|l|KG|GR|LT|ML|G|L)\s*$`
	re := regexp.MustCompile(quantityPattern)
	normalized = re.ReplaceAllString(normalized, "")

	// Kelime kelime temizlik: Sadece sayı içeren kelimeleri ve birimleri kaldır
	words := strings.Fields(normalized)
	var cleanedWords []string
	for _, word := range words {
		// Sayı içeren kelimeleri atla (örn: "1", "500", "2.5", "1KG", "500GR")
		if isNumericOrUnit(word) {
			continue
		}
		cleanedWords = append(cleanedWords, word)
	}

	result := strings.Join(cleanedWords, " ")
	return strings.TrimSpace(result)
}

// isNumericOrUnit: Bir kelimenin sadece sayı veya birim (kg/gr/lt/ml/g/l) içerip içermediğini kontrol eder
func isNumericOrUnit(word string) bool {
	wordLower := strings.ToLower(strings.TrimSpace(word))
	
	// Tamamen sayı mı? (örn: "1", "500", "2.5", "1.25")
	if matched, _ := regexp.MatchString(`^[\d.,]+$`, wordLower); matched {
		return true
	}

	// Sayı + birim mi? (örn: "1kg", "500gr", "2.5lt", "1KG", "500GR")
	unitPattern := `^[\d.,]+\s*(?:kg|gr|lt|ml|g|l)$`
	if matched, _ := regexp.MatchString(unitPattern, wordLower); matched {
		return true
	}

	// Sadece birim mi? (örn: "kg", "gr", "lt", "ml", "g", "l")
	units := []string{"kg", "gr", "lt", "ml", "g", "l"}
	for _, unit := range units {
		if wordLower == unit {
			return true
		}
	}

	return false
}

// POST /api/stock-entries/upload-order
// XLSX dosyasını yükler ve ürün sıralamasını kaydeder
func UploadProductOrderHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Kullanıcı ve şube bilgisi
		branchID, err := resolveBranchIDFromContext(c)
		if err != nil {
			return err
		}

		// Dosya yükleme
		fileHeader, err := c.FormFile("file")
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Dosya yüklenemedi: "+err.Error())
		}

		if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".xlsx") {
			return fiber.NewError(fiber.StatusBadRequest, "Sadece .xlsx dosyaları yüklenebilir")
		}

		// Dosyayı aç
		file, err := fileHeader.Open()
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Dosya açılamadı: "+err.Error())
		}
		defer file.Close()

		// Excelize ile dosyayı oku
		excelFile, err := excelize.OpenReader(file)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Excel dosyası okunamadı: "+err.Error())
		}
		defer excelFile.Close()

		// İlk sheet'i al
		sheetList := excelFile.GetSheetList()
		if len(sheetList) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Excel dosyasında sheet bulunamadı")
		}
		sheetName := sheetList[0]

		// Sheet'teki tüm satırları oku
		rows, err := excelFile.GetRows(sheetName)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Sheet okunamadı: "+err.Error())
		}

		if len(rows) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Excel dosyası boş")
		}

		// İlk satırın başlık satırı olup olmadığını kontrol et
		// "ÜRÜN ADI", "PRODUCT", "PRODUCT NAME" gibi kelimeler varsa başlık satırıdır
		skipFirstRow := false
		if len(rows) > 0 && len(rows[0]) > 0 {
			firstCell := strings.ToUpper(strings.TrimSpace(rows[0][0]))
			if strings.Contains(firstCell, "ÜRÜN") || strings.Contains(firstCell, "PRODUCT") || 
			   strings.Contains(firstCell, "PRODUCT NAME") || firstCell == "ÜRÜN ADI" {
				skipFirstRow = true
			}
		}

		// Eski sıralamayı sil (bu şube için)
		if err := database.DB.Where("branch_id = ?", branchID).Delete(&models.BranchProductOrder{}).Error; err != nil {
			log.Printf("Eski sıralama silinirken hata: %v", err)
			// Devam et, kritik değil
		}

		// Ürünleri eşleştir ve sıralama kaydet
		orderIndex := 0
		matchedCount := 0
		unmatchedProducts := make([]string, 0)

		startIndex := 0
		if skipFirstRow {
			startIndex = 1
			log.Printf("İlk satır başlık satırı olarak algılandı, atlanıyor")
		}

		for i := startIndex; i < len(rows); i++ {
			row := rows[i]
			
			// Boş satırları atla
			if len(row) == 0 {
				continue
			}

			// İlk kolonu ürün adı olarak al (trim yap)
			productName := strings.TrimSpace(row[0])
			if productName == "" {
				continue
			}

			// Ürünü bul (isim veya stok kodu ile - büyük/küçük harf, Türkçe karakter ve miktar bilgileri duyarsız)
			// Tüm ürünleri çekip normalize edilmiş haliyle karşılaştır
			var products []models.Product
			if err := database.DB.Find(&products).Error; err != nil {
				unmatchedProducts = append(unmatchedProducts, productName)
				continue
			}

			// Ürün adını normalize et (Türkçe karakterler + miktar bilgileri kaldırıldı)
			normalizedProductName := normalizeProductName(productName)
			var product models.Product
			found := false

			for _, p := range products {
				// Veritabanındaki ürün adını normalize et
				normalizedDBName := normalizeProductName(p.Name)
				
				// Stok kodunu da kontrol et (stok kodunda genelde miktar bilgisi olmaz ama yine de normalize edelim)
				normalizedDBStockCode := ""
				if p.StockCode != "" {
					normalizedDBStockCode = normalizeTurkish(p.StockCode)
				}

				// Eşleşme kontrolü: normalize edilmiş ürün adları veya stok kodu
				if normalizedDBName == normalizedProductName {
					product = p
					found = true
					break
				}
				// Stok kodu ile de eşleştirmeyi dene (stok kodunda genelde miktar bilgisi olmaz)
				if normalizedDBStockCode != "" && normalizedDBStockCode == normalizeTurkish(productName) {
					product = p
					found = true
					break
				}
			}

			if !found {
				unmatchedProducts = append(unmatchedProducts, productName)
				continue
			}

			// Sıralama kaydı oluştur
			order := models.BranchProductOrder{
				BranchID:   branchID,
				ProductID:  product.ID,
				OrderIndex: orderIndex,
			}

			if err := database.DB.Create(&order).Error; err != nil {
				log.Printf("Sıralama kaydı oluşturulurken hata (product_id=%d): %v", product.ID, err)
				continue
			}

			orderIndex++
			matchedCount++
		}

		return c.JSON(fiber.Map{
			"success":           true,
			"matched_count":     matchedCount,
			"unmatched_products": unmatchedProducts,
			"message":           fmt.Sprintf("%d ürün sıralaması kaydedildi. %d ürün eşleşmedi.", matchedCount, len(unmatchedProducts)),
		})
	}
}

// resolveBranchIDFromContext: Context'ten branch ID'yi al
func resolveBranchIDFromContext(c *fiber.Ctx) (uint, error) {
	bVal := c.Locals(auth.CtxBranchIDKey)
	if bPtr, ok := bVal.(*uint); ok && bPtr != nil {
		return *bPtr, nil
	}

	// Super admin ise query'den al
	userIDVal := c.Locals(auth.CtxUserIDKey)
	userID, ok := userIDVal.(uint)
	if !ok {
		return 0, fiber.NewError(fiber.StatusForbidden, "Kullanıcı bilgisi alınamadı")
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return 0, fiber.NewError(fiber.StatusInternalServerError, "Kullanıcı bulunamadı")
	}

	if user.Role == models.RoleSuperAdmin {
		// Query'den branch_id al
		branchIDStr := c.Query("branch_id")
		if branchIDStr == "" {
			return 0, fiber.NewError(fiber.StatusBadRequest, "Super admin için branch_id gerekli")
		}
		branchID, err := strconv.ParseUint(branchIDStr, 10, 32)
		if err != nil {
			return 0, fiber.NewError(fiber.StatusBadRequest, "Geçersiz branch_id")
		}
		return uint(branchID), nil
	}

	return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi alınamadı")
}

