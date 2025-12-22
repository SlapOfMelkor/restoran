package produce

import (
	"fmt"
	"strings"

	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type ProduceProductResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	StockCode string `json:"stock_code"`
}

type CreateProduceProductRequest struct {
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	StockCode string `json:"stock_code"`
}

type UpdateProduceProductRequest struct {
	Name      *string `json:"name"`
	Unit      *string `json:"unit"`
	StockCode *string `json:"stock_code"`
}

// GET /api/produce-products
func ListProduceProductsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var products []models.ProduceProduct
		if err := database.DB.Order("name asc").Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Manav ürünleri listelenemedi")
		}

		res := make([]ProduceProductResponse, 0, len(products))
		for _, p := range products {
			res = append(res, ProduceProductResponse{
				ID:        p.ID,
				Name:      p.Name,
				Unit:      p.Unit,
				StockCode: p.StockCode,
			})
		}
		return c.JSON(res)
	}
}

// POST /api/produce-products
func CreateProduceProductHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProduceProductRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		body.Name = strings.TrimSpace(body.Name)
		body.Unit = strings.TrimSpace(body.Unit)
		body.StockCode = strings.TrimSpace(body.StockCode)

		if body.Name == "" || body.Unit == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Name ve unit zorunlu")
		}

		// Ürün adı unique kontrolü (sadece manav ürünleri arasında)
		var existingProductByName models.ProduceProduct
		if err := database.DB.Where("name = ?", body.Name).First(&existingProductByName).Error; err == nil {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Bu ürün adı zaten kullanılıyor: %s", body.Name))
		}

		// Stok kodu unique kontrolü (boş değilse, sadece manav ürünleri arasında)
		if body.StockCode != "" {
			var existingProductByStockCode models.ProduceProduct
			if err := database.DB.Where("stock_code = ?", body.StockCode).First(&existingProductByStockCode).Error; err == nil {
				return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Bu stok kodu zaten kullanılıyor: %s", body.StockCode))
			}
		}

		p := models.ProduceProduct{
			Name:      body.Name,
			Unit:      body.Unit,
			StockCode: body.StockCode,
		}

		if err := database.DB.Create(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Ürün oluşturulamadı: %v", err))
		}

		return c.Status(fiber.StatusCreated).JSON(ProduceProductResponse{
			ID:        p.ID,
			Name:      p.Name,
			Unit:      p.Unit,
			StockCode: p.StockCode,
		})
	}
}

// PUT /api/produce-products/:id
func UpdateProduceProductHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var p models.ProduceProduct
		if err := database.DB.First(&p, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Manav ürünü bulunamadı")
		}

		var body UpdateProduceProductRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Name boş olamaz")
			}
			// Ürün adı unique kontrolü (sadece manav ürünleri arasında)
			var existingProductByName models.ProduceProduct
			if err := database.DB.Where("name = ? AND id != ?", name, id).First(&existingProductByName).Error; err == nil {
				return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Bu ürün adı zaten kullanılıyor: %s", name))
			}
			p.Name = name
		}
		if body.Unit != nil {
			unit := strings.TrimSpace(*body.Unit)
			if unit == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Unit boş olamaz")
			}
			p.Unit = unit
		}
		if body.StockCode != nil {
			stockCode := strings.TrimSpace(*body.StockCode)
			// Eğer stok kodu boşaltılıyorsa veya yeni bir değer veriliyorsa unique kontrolü yap
			if stockCode != "" && stockCode != p.StockCode {
				var existingProductByStockCode models.ProduceProduct
				if err := database.DB.Where("stock_code = ? AND id != ?", stockCode, id).First(&existingProductByStockCode).Error; err == nil {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Bu stok kodu zaten kullanılıyor: %s", stockCode))
				}
			}
			p.StockCode = stockCode
		}

		if err := database.DB.Save(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Manav ürünü güncellenemedi: %v", err))
		}

		return c.JSON(ProduceProductResponse{
			ID:        p.ID,
			Name:      p.Name,
			Unit:      p.Unit,
			StockCode: p.StockCode,
		})
	}
}

// DELETE /api/produce-products/:id
func DeleteProduceProductHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var p models.ProduceProduct
		if err := database.DB.First(&p, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Manav ürünü bulunamadı")
		}

		// Ürüne ait alım var mı kontrol et
		var count int64
		database.DB.Model(&models.ProducePurchase{}).Where("product_id = ?", id).Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu ürüne ait alım kayıtları var, önce alımları silin")
		}

		// Ürüne ait zayiat var mı kontrol et
		database.DB.Model(&models.ProduceWaste{}).Where("product_id = ?", id).Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu ürüne ait zayiat kayıtları var, önce zayiat kayıtlarını silin")
		}

		if err := database.DB.Delete(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Manav ürünü silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}
