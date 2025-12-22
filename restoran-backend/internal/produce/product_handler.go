package produce

import (
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

// GET /api/produce-products (manav ürünleri - IsCenterProduct = false)
func ListProduceProductsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var products []models.Product
		if err := database.DB.Where("is_center_product = ?", false).Order("name asc").Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
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

		// Stok kodu unique kontrolü (boş değilse)
		if body.StockCode != "" {
			var existingProduct models.Product
			if err := database.DB.Where("stock_code = ?", body.StockCode).First(&existingProduct).Error; err == nil {
				return fiber.NewError(fiber.StatusBadRequest, "Bu stok kodu zaten kullanılıyor")
			}
		}

		p := models.Product{
			Name:            body.Name,
			Unit:            body.Unit,
			StockCode:       body.StockCode,
			IsCenterProduct: false, // Manav ürünü
		}

		if err := database.DB.Create(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün oluşturulamadı")
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

		var p models.Product
		if err := database.DB.First(&p, "id = ? AND is_center_product = ?", id, false).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı")
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
			// Eğer stok kodu değiştiriliyorsa ve boş değilse, unique kontrolü yap
			if stockCode != "" && stockCode != p.StockCode {
				var existingProduct models.Product
				if err := database.DB.Where("stock_code = ? AND id != ?", stockCode, id).First(&existingProduct).Error; err == nil {
					return fiber.NewError(fiber.StatusBadRequest, "Bu stok kodu zaten kullanılıyor")
				}
			}
			p.StockCode = stockCode
		}

		if err := database.DB.Save(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün güncellenemedi")
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

		var p models.Product
		if err := database.DB.First(&p, "id = ? AND is_center_product = ?", id, false).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı")
		}

		// Ürüne ait manav alımları var mı kontrol et
		var count int64
		database.DB.Model(&models.ProducePurchase{}).Where("product_id = ?", id).Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu ürüne ait manav alımları var, önce alımları silin")
		}

		if err := database.DB.Delete(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

