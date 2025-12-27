package trade

import (
	"fmt"
	"strings"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

// -------------------------
// Request/Response Types
// -------------------------

type CreatePropertyRequest struct {
	Name        string  `json:"name"`
	Value       float64 `json:"value"`
	Description string  `json:"description"`
	BranchID    *uint   `json:"branch_id"` // super_admin için opsiyonel
}

type UpdatePropertyRequest struct {
	Name        *string  `json:"name"`
	Value       *float64 `json:"value"`
	Description *string  `json:"description"`
}

type PropertyResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	Name        string  `json:"name"`
	Value       float64 `json:"value"`
	Description string  `json:"description"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

// -------------------------
// Property CRUD
// -------------------------

// POST /api/properties
func CreatePropertyHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreatePropertyRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		// Validasyon
		if strings.TrimSpace(body.Name) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "isim boş olamaz")
		}
		if body.Value < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "değer 0'dan küçük olamaz")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		property := models.Property{
			BranchID:    branchID,
			Name:        strings.TrimSpace(body.Name),
			Value:       body.Value,
			Description: strings.TrimSpace(body.Description),
		}

		if err := database.DB.Create(&property).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Mal mülk kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":          property.ID,
				"branch_id":   property.BranchID,
				"name":        property.Name,
				"value":       property.Value,
				"description": property.Description,
			}
			branchIDForLog := &property.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "property",
				EntityID:    property.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Mal mülk eklendi: %s - %.2f TL", property.Name, property.Value),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(PropertyResponse{
			ID:          property.ID,
			BranchID:    property.BranchID,
			Name:        property.Name,
			Value:       property.Value,
			Description: property.Description,
			CreatedAt:   property.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   property.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
}

// GET /api/properties?branch_id=...
func ListPropertiesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var properties []models.Property
		if err := database.DB.Where("branch_id = ?", branchID).
			Order("created_at desc").
			Find(&properties).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Mal mülkler listelenemedi")
		}

		resp := make([]PropertyResponse, 0, len(properties))
		for _, p := range properties {
			resp = append(resp, PropertyResponse{
				ID:          p.ID,
				BranchID:    p.BranchID,
				Name:        p.Name,
				Value:       p.Value,
				Description: p.Description,
				CreatedAt:   p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				UpdatedAt:   p.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
			})
		}

		return c.JSON(resp)
	}
}

// PUT /api/properties/:id
func UpdatePropertyHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var property models.Property
		if err := database.DB.First(&property, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Mal mülk bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != property.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu mal mülke erişim yetkiniz yok")
			}
		}

		var body UpdatePropertyRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		beforeData := map[string]interface{}{
			"id":          property.ID,
			"name":        property.Name,
			"value":       property.Value,
			"description": property.Description,
		}

		updated := false

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "isim boş olamaz")
			}
			property.Name = name
			updated = true
		}

		if body.Value != nil {
			if *body.Value < 0 {
				return fiber.NewError(fiber.StatusBadRequest, "değer 0'dan küçük olamaz")
			}
			property.Value = *body.Value
			updated = true
		}

		if body.Description != nil {
			property.Description = strings.TrimSpace(*body.Description)
			updated = true
		}

		if !updated {
			return c.JSON(PropertyResponse{
				ID:          property.ID,
				BranchID:    property.BranchID,
				Name:        property.Name,
				Value:       property.Value,
				Description: property.Description,
				CreatedAt:   property.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				UpdatedAt:   property.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
			})
		}

		if err := database.DB.Save(&property).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Mal mülk güncellenemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":          property.ID,
				"name":        property.Name,
				"value":       property.Value,
				"description": property.Description,
			}
			branchIDForLog := &property.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "property",
				EntityID:    property.ID,
				Action:      models.AuditActionUpdate,
				Description: fmt.Sprintf("Mal mülk güncellendi: %s", property.Name),
				Before:      beforeData,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.JSON(PropertyResponse{
			ID:          property.ID,
			BranchID:    property.BranchID,
			Name:        property.Name,
			Value:       property.Value,
			Description: property.Description,
			CreatedAt:   property.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   property.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
}

// DELETE /api/properties/:id
func DeletePropertyHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var property models.Property
		if err := database.DB.First(&property, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Mal mülk bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != property.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu mal mülke erişim yetkiniz yok")
			}
		}

		beforeData := map[string]interface{}{
			"id":          property.ID,
			"name":        property.Name,
			"value":       property.Value,
			"description": property.Description,
		}

		if err := database.DB.Delete(&property).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Mal mülk silinemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			branchIDForLog := &property.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "property",
				EntityID:    property.ID,
				Action:      models.AuditActionDelete,
				Description: fmt.Sprintf("Mal mülk silindi: %s - %.2f TL", property.Name, property.Value),
				Before:      beforeData,
				After:       nil,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

