package inventory

import (
	"fmt"
	"log"
	"restoran-backend/internal/config"

	"github.com/gofiber/fiber/v2"
)

// ParseB2BOrderURLHandler: B2B URL'den sipariş bilgilerini çeker ve parse eder
// POST /api/shipments/parse-order-url
// Body: { "url": "https://b2b.cadininevi.com.tr/Store/OrderDetail/..." }
func ParseB2BOrderURLHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			URL string `json:"url"`
		}
		
		if err := c.BodyParser(&body); err != nil {
			log.Printf("B2B URL parse request body parse error: %v", err)
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi. 'url' field'ı gönderilmelidir.")
		}

		if body.URL == "" {
			return fiber.NewError(fiber.StatusBadRequest, "URL boş olamaz")
		}

		// URL'i parse et
		log.Printf("B2B URL parsing başladı: %s", body.URL)
		result, err := ParseB2BOrderURL(body.URL)
		if err != nil {
			log.Printf("B2B URL parse error: %v", err)
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Sipariş bilgileri alınamadı: %v", err))
		}

		log.Printf("B2B URL parse başarılı, %d ürün bulundu", len(result.Products))

		// Tüm ürünler için fotoğraf indir (sync - parse işlemi sırasında)
		// Fotoğraf zaten varsa indirme yapılmaz (DownloadProductImage içinde kontrol ediliyor)
		for i := range result.Products {
			product := &result.Products[i]
			// Stok kodu olan tüm ürünler için fotoğraf kontrolü yap ve yoksa indir
			if product.StockCode != "" {
				imagePath, err := DownloadProductImage(product.StockCode, cfg.ProductImagePath)
				if err != nil {
					log.Printf("Ürün fotoğrafı indirilemedi (%s): %v", product.StockCode, err)
					// Hata olsa bile devam et, sadece log'la
				} else {
					log.Printf("Ürün fotoğrafı hazır (%s): %s", product.StockCode, imagePath)
				}
			}
		}

		log.Printf("Fotoğraf indirme işlemi tamamlandı")
		return c.JSON(result)
	}
}

