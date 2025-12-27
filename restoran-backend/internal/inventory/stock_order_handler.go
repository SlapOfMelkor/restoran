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

// GetProductOrderHandler: GET /api/stock-entries/order
// Mevcut ürün sıralamasını getirir
func GetProductOrderHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromContext(c)
		if err != nil {
			return err
		}

		var orders []models.BranchProductOrder
		if err := database.DB.Where("branch_id = ?", branchID).
			Order("order_index asc").
			Preload("Product").
			Find(&orders).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Sıralama bilgisi alınamadı")
		}

		// Product ID'lerini sıraya göre döndür
		productIDs := make([]uint, 0, len(orders))
		for _, order := range orders {
			// Sadece mevcut ürünleri dahil et (silinmiş ürünleri filtrele)
			var product models.Product
			if database.DB.First(&product, "id = ?", order.ProductID).Error == nil {
				productIDs = append(productIDs, order.ProductID)
			} else {
				// Silinmiş ürünün sıralama kaydını da sil
				database.DB.Delete(&models.BranchProductOrder{}, "id = ?", order.ID)
			}
		}

		return c.JSON(fiber.Map{
			"product_ids": productIDs,
		})
	}
}

// SaveProductOrderHandler: POST /api/stock-entries/order
// Ürün sıralamasını kaydeder
func SaveProductOrderHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromContext(c)
		if err != nil {
			return err
		}

		var body struct {
			ProductIDs []uint `json:"product_ids"`
		}

		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek: "+err.Error())
		}

		// Ürün ID'lerinin geçerli olduğunu kontrol et
		if len(body.ProductIDs) > 0 {
			var count int64
			if err := database.DB.Model(&models.Product{}).
				Where("id IN ?", body.ProductIDs).
				Count(&count).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Ürünler kontrol edilemedi")
			}
			if int(count) != len(body.ProductIDs) {
				return fiber.NewError(fiber.StatusBadRequest, "Geçersiz ürün ID'leri bulundu")
			}
		}

		// Eski sıralamayı sil (bu şube için)
		if err := database.DB.Where("branch_id = ?", branchID).Delete(&models.BranchProductOrder{}).Error; err != nil {
			log.Printf("Eski sıralama silinirken hata: %v", err)
		}

		// Yeni sıralamayı kaydet
		orders := make([]models.BranchProductOrder, 0, len(body.ProductIDs))
		for index, productID := range body.ProductIDs {
			orders = append(orders, models.BranchProductOrder{
				BranchID:   branchID,
				ProductID:  productID,
				OrderIndex: index,
			})
		}

		if len(orders) > 0 {
			if err := database.DB.Create(&orders).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Sıralama kaydedilemedi: "+err.Error())
			}
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("%d ürün sıralaması kaydedildi", len(orders)),
		})
	}
}

// ClearProductOrderHandler: DELETE /api/stock-entries/order
// Ürün sıralamasını temizler
func ClearProductOrderHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromContext(c)
		if err != nil {
			return err
		}

		if err := database.DB.Where("branch_id = ?", branchID).Delete(&models.BranchProductOrder{}).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Sıralama temizlenemedi: "+err.Error())
		}

		return c.JSON(fiber.Map{
			"success": true,
			"message": "Sıralama temizlendi",
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

