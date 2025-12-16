package inventory

import (
	"strings"

	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type ProductCategoryResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

type CreateProductCategoryRequest struct {
	Name string `json:"name"`
}

type UpdateProductCategoryRequest struct {
	Name *string `json:"name"`
}

// GET /api/admin/product-categories
func ListProductCategoriesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var categories []models.ProductCategory
		if err := database.DB.Order("name asc").Find(&categories).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategoriler listelenemedi")
		}

		res := make([]ProductCategoryResponse, 0, len(categories))
		for _, cat := range categories {
			res = append(res, ProductCategoryResponse{
				ID:        cat.ID,
				Name:      cat.Name,
				CreatedAt: cat.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}
		return c.JSON(res)
	}
}

// POST /api/admin/product-categories
func CreateProductCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProductCategoryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Kategori adı zorunlu")
		}

		cat := models.ProductCategory{
			Name: body.Name,
		}

		if err := database.DB.Create(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori oluşturulamadı")
		}

		return c.Status(fiber.StatusCreated).JSON(ProductCategoryResponse{
			ID:        cat.ID,
			Name:      cat.Name,
			CreatedAt: cat.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// PUT /api/admin/product-categories/:id
func UpdateProductCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var cat models.ProductCategory
		if err := database.DB.First(&cat, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kategori bulunamadı")
		}

		var body UpdateProductCategoryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Kategori adı boş olamaz")
			}
			cat.Name = name
		}

		if err := database.DB.Save(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori güncellenemedi")
		}

		return c.JSON(ProductCategoryResponse{
			ID:        cat.ID,
			Name:      cat.Name,
			CreatedAt: cat.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// DELETE /api/admin/product-categories/:id
func DeleteProductCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		// Kategoriye ait ürün var mı kontrol et
		var count int64
		database.DB.Model(&models.Product{}).Where("category_id = ?", id).Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu kategoriye ait ürünler var, önce ürünleri silin")
		}

		if err := database.DB.Delete(&models.ProductCategory{}, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

