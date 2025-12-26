package inventory

import (
	"log"
	"restoran-backend/internal/config"

	"github.com/gofiber/fiber/v2"
)

// BulkImportB2BProductsRequest: Toplu import isteği
type BulkImportB2BProductsRequest struct {
	Prefix  string `json:"prefix"`  // "TM" veya "CD"
	Start   int    `json:"start"`   // Başlangıç numarası (örn: 0)
	End     int    `json:"end"`     // Bitiş numarası (örn: 9999)
	DelayMs int    `json:"delay_ms"` // Requestler arası delay (milisaniye)
}

// BulkImportB2BProductsResponse: Toplu import yanıtı
type BulkImportB2BProductsResponse struct {
	Imported int      `json:"imported"` // İçe aktarılan ürün sayısı
	Skipped  int      `json:"skipped"`  // Atlanan ürün sayısı
	Errors   []string `json:"errors"`   // Hata mesajları
}

// BulkImportB2BProductsHandler: B2B sisteminden toplu ürün içe aktarma endpoint'i
// POST /api/admin/products/bulk-import-b2b
func BulkImportB2BProductsHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body BulkImportB2BProductsRequest
		if err := c.BodyParser(&body); err != nil {
			log.Printf("Bulk import request body parse error: %v", err)
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		// Validasyon
		if body.Prefix != "TM" && body.Prefix != "CD" {
			return fiber.NewError(fiber.StatusBadRequest, "Prefix 'TM' veya 'CD' olmalı")
		}

		if body.Start < 0 || body.End < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Start ve end 0 veya pozitif olmalı")
		}

		if body.Start > body.End {
			return fiber.NewError(fiber.StatusBadRequest, "Start, end'den büyük olamaz")
		}

		if body.End > 9999 {
			return fiber.NewError(fiber.StatusBadRequest, "End maksimum 9999 olabilir")
		}

		if body.DelayMs < 0 {
			body.DelayMs = 500 // Varsayılan 500ms delay
		}
		if body.DelayMs > 10000 {
			return fiber.NewError(fiber.StatusBadRequest, "Delay maksimum 10000ms (10 saniye) olabilir")
		}

		log.Printf("Bulk import başladı: %s%d-%s%d, delay: %dms", body.Prefix, body.Start, body.Prefix, body.End, body.DelayMs)

		// Toplu import işlemini başlat
		imported, skipped, errors := BulkImportB2BProducts(cfg, body.Prefix, body.Start, body.End, body.DelayMs)

		log.Printf("Bulk import tamamlandı: %d imported, %d skipped, %d errors", imported, skipped, len(errors))

		return c.JSON(BulkImportB2BProductsResponse{
			Imported: imported,
			Skipped:  skipped,
			Errors:   errors,
		})
	}
}

