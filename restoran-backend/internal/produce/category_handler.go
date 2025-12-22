package produce

import (
	"fmt"
	"strings"

	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type ProduceCategoryResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	BranchID  uint   `json:"branch_id"`
	CreatedAt string `json:"created_at"`
}

type CreateProduceCategoryRequest struct {
	Name     string `json:"name"`
	BranchID *uint  `json:"branch_id"` // super_admin için opsiyonel
}

type UpdateProduceCategoryRequest struct {
	Name *string `json:"name"`
}

func resolveBranchIDFromBodyOrRole(c *fiber.Ctx, bodyBranchID *uint) (uint, error) {
	roleVal := c.Locals(auth.CtxUserRoleKey)
	role, ok := roleVal.(models.UserRole)
	if !ok {
		return 0, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	if role == models.RoleBranchAdmin {
		bVal := c.Locals(auth.CtxBranchIDKey)
		bPtr, ok := bVal.(*uint)
		if !ok || bPtr == nil {
			return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
		}
		return *bPtr, nil
	}

	// super_admin
	if bodyBranchID == nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
	}
	return *bodyBranchID, nil
}

func resolveBranchIDFromQueryOrRole(c *fiber.Ctx) (uint, error) {
	roleVal := c.Locals(auth.CtxUserRoleKey)
	role, ok := roleVal.(models.UserRole)
	if !ok {
		return 0, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	if role == models.RoleBranchAdmin {
		bVal := c.Locals(auth.CtxBranchIDKey)
		bPtr, ok := bVal.(*uint)
		if !ok || bPtr == nil {
			return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
		}
		return *bPtr, nil
	}

	// super_admin
	bidStr := c.Query("branch_id")
	if bidStr == "" {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
	}
	var bid uint
	if _, err := fmt.Sscan(bidStr, &bid); err != nil || bid == 0 {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id geçersiz")
	}
	return bid, nil
}

// GET /api/produce-categories?branch_id=...
func ListProduceCategoriesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var categories []models.ProductCategory
		if err := database.DB.Where("branch_id = ? AND is_center_product = ?", branchID, false).Order("name asc").Find(&categories).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategoriler listelenemedi")
		}

		res := make([]ProduceCategoryResponse, 0, len(categories))
		for _, cat := range categories {
			res = append(res, ProduceCategoryResponse{
				ID:        cat.ID,
				Name:      cat.Name,
				BranchID:  cat.BranchID,
				CreatedAt: cat.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}
		return c.JSON(res)
	}
}

// POST /api/produce-categories
func CreateProduceCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProduceCategoryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Kategori adı zorunlu")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		// Aynı şubede aynı isimde manav kategorisi var mı kontrol et
		var existingCat models.ProductCategory
		if err := database.DB.Where("branch_id = ? AND name = ? AND is_center_product = ?", branchID, body.Name, false).First(&existingCat).Error; err == nil {
			return fiber.NewError(fiber.StatusBadRequest, "Bu şubede bu isimde bir manav kategorisi zaten var")
		}

		cat := models.ProductCategory{
			BranchID:        branchID,
			Name:            body.Name,
			IsCenterProduct: false, // Manav kategorisi
		}

		if err := database.DB.Create(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori oluşturulamadı")
		}

		return c.Status(fiber.StatusCreated).JSON(ProduceCategoryResponse{
			ID:        cat.ID,
			Name:      cat.Name,
			BranchID:  cat.BranchID,
			CreatedAt: cat.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// PUT /api/produce-categories/:id
func UpdateProduceCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var cat models.ProductCategory
		if err := database.DB.First(&cat, "id = ? AND is_center_product = ?", id, false).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kategori bulunamadı")
		}

		// Şube kontrolü - branch_admin sadece kendi şubesine erişebilir
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != cat.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu kategoriye erişim yetkiniz yok")
			}
		}

		var body UpdateProduceCategoryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Kategori adı boş olamaz")
			}
			// Aynı şubede aynı isimde başka manav kategorisi var mı kontrol et
			var existingCat models.ProductCategory
			if err := database.DB.Where("branch_id = ? AND name = ? AND is_center_product = ? AND id != ?", cat.BranchID, name, false, id).First(&existingCat).Error; err == nil {
				return fiber.NewError(fiber.StatusBadRequest, "Bu şubede bu isimde bir manav kategorisi zaten var")
			}
			cat.Name = name
		}

		if err := database.DB.Save(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori güncellenemedi")
		}

		return c.JSON(ProduceCategoryResponse{
			ID:        cat.ID,
			Name:      cat.Name,
			BranchID:  cat.BranchID,
			CreatedAt: cat.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// DELETE /api/produce-categories/:id
func DeleteProduceCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var cat models.ProductCategory
		if err := database.DB.First(&cat, "id = ? AND is_center_product = ?", id, false).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kategori bulunamadı")
		}

		// Şube kontrolü - branch_admin sadece kendi şubesine erişebilir
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != cat.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu kategoriye erişim yetkiniz yok")
			}
		}

		// Kategoriye ait ürün var mı kontrol et (sadece manav ürünleri)
		var count int64
		database.DB.Model(&models.Product{}).Where("category_id = ? AND is_center_product = ?", id, false).Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu kategoriye ait manav ürünleri var, önce ürünleri silin")
		}

		if err := database.DB.Delete(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

