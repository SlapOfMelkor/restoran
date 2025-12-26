package inventory

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"restoran-backend/internal/config"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type ProductResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	StockCode string `json:"stock_code"`
	Category  string `json:"category"`
}

type CreateProductRequest struct {
	Name      string `json:"name"`
	Unit      string `json:"unit"`
	StockCode string `json:"stock_code"` // Opsiyonel
	Category  string `json:"category"`   // Opsiyonel
}

type UpdateProductRequest struct {
	Name      *string `json:"name"`
	Unit      *string `json:"unit"`
	StockCode *string `json:"stock_code"` // Opsiyonel
	Category  *string `json:"category"`   // Opsiyonel
}

// GET /api/products (tüm authenticated kullanıcılar görebilir)
func ListProductsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var products []models.Product
		if err := database.DB.Order("name asc").Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
		}

		res := make([]ProductResponse, 0, len(products))
		for _, p := range products {
			res = append(res, ProductResponse{
				ID:        p.ID,
				Name:      p.Name,
				Unit:      p.Unit,
				StockCode: p.StockCode,
				Category:  p.Category,
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
		body.Category = strings.TrimSpace(body.Category)

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
			Category:        body.Category,
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
			Category:  p.Category,
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

		if body.StockCode != nil {
			p.StockCode = strings.TrimSpace(*body.StockCode)
		}

		if body.Category != nil {
			p.Category = strings.TrimSpace(*body.Category)
		}

		if err := database.DB.Save(&p).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürün güncellenemedi")
		}

		return c.JSON(ProductResponse{
			ID:        p.ID,
			Name:      p.Name,
			Unit:      p.Unit,
			StockCode: p.StockCode,
			Category:  p.Category,
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

// DELETE /api/admin/products (tüm ürünleri sil)
func DeleteAllProductsHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Önce tüm ürünleri çek (fotoğrafları silmek için stok kodlarına ihtiyacımız var)
		var products []models.Product
		if err := database.DB.Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
		}

		// Ürün fotoğraflarını sil
		deletedImages := 0
		for _, product := range products {
			if product.StockCode != "" {
				imagePath := filepath.Join(cfg.ProductImagePath, fmt.Sprintf("%s.jpg", product.StockCode))
				if err := os.Remove(imagePath); err == nil {
					deletedImages++
					log.Printf("Ürün fotoğrafı silindi: %s", imagePath)
				} else if !os.IsNotExist(err) {
					// Dosya yoksa sorun değil, diğer hataları log'la
					log.Printf("Ürün fotoğrafı silinirken hata (%s): %v", imagePath, err)
				}
			}
		}

		// Tüm ürünleri veritabanından sil
		if err := database.DB.Exec("DELETE FROM products").Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler silinemedi")
		}

		log.Printf("Tüm ürünler silindi. %d fotoğraf silindi.", deletedImages)

		return c.SendStatus(fiber.StatusNoContent)
	}
}
