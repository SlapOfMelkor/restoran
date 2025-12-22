package inventory

import (
	"strings"

	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type ProductResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	StockCode string `json:"stock_code"`
}

type CreateProductRequest struct {
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	StockCode string `json:"stock_code"` // Opsiyonel
}

type UpdateProductRequest struct {
	Name      *string `json:"name"`
	Unit      *string `json:"unit"`
	StockCode *string `json:"stock_code"` // Opsiyonel
}

// GET /api/products?is_center_product=true (tüm authenticated kullanıcılar görebilir)
// Varsayılan olarak sadece IsCenterProduct = true olan ürünleri döndürür
func ListProductsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		dbq := database.DB.Model(&models.Product{})
		
		// is_center_product filter'ı
		isCenterProductStr := c.Query("is_center_product")
		if isCenterProductStr == "false" {
			// Sadece false isteğinde manav ürünlerini döndür
			dbq = dbq.Where("is_center_product = ?", false)
		} else {
			// Varsayılan: Sadece center product'ları döndür (true veya parametre yoksa)
			dbq = dbq.Where("is_center_product = ?", true)
		}

		var products []models.Product
		if err := dbq.Order("name asc").Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
		}

		res := make([]ProductResponse, 0, len(products))
		for _, p := range products {
			res = append(res, ProductResponse{
				ID:        p.ID,
				Name:      p.Name,
				Unit:      p.Unit,
				StockCode: p.StockCode,
			})
		}
		return c.JSON(res)
	}
}

// POST /api/admin/products (sadece super_admin)
func CreateProductHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProductRequest
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
			IsCenterProduct: true, // Normal ürün yönetimi için her zaman true
		}

		if err := database.DB.Create(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün oluşturulamadı")
		}

		return c.Status(fiber.StatusCreated).JSON(ProductResponse{
			ID:        p.ID,
			Name:      p.Name,
			Unit:      p.Unit,
			StockCode: p.StockCode,
		})
	}
}

// PUT /api/admin/products/:id
func UpdateProductHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var p models.Product
		if err := database.DB.First(&p, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ürün bulunamadı")
		}

		var body UpdateProductRequest
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

		if err := database.DB.Save(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün güncellenemedi")
		}

		return c.JSON(ProductResponse{
			ID:        p.ID,
			Name:      p.Name,
			Unit:      p.Unit,
			StockCode: p.StockCode,
		})
	}
}

// DELETE /api/admin/products/:id
func DeleteProductHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		if err := database.DB.Delete(&models.Product{}, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}
