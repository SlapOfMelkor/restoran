package produce

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

type CreateProduceSupplierRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	BranchID    *uint  `json:"branch_id"` // super_admin için opsiyonel
}

type UpdateProduceSupplierRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type ProduceSupplierResponse struct {
	ID          uint   `json:"id"`
	BranchID    uint   `json:"branch_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// -------------------------
// Produce Supplier CRUD
// -------------------------

// POST /api/produce-suppliers
func CreateProduceSupplierHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProduceSupplierRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		// Validasyon
		if strings.TrimSpace(body.Name) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "isim boş olamaz")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		supplier := models.ProduceSupplier{
			BranchID:    branchID,
			Name:        strings.TrimSpace(body.Name),
			Description: strings.TrimSpace(body.Description),
		}

		if err := database.DB.Create(&supplier).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Tedarikçi kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":          supplier.ID,
				"branch_id":   supplier.BranchID,
				"name":        supplier.Name,
				"description": supplier.Description,
			}
			branchIDForLog := &supplier.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "produce_supplier",
				EntityID:    supplier.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Manav tedarikçi eklendi: %s", supplier.Name),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(ProduceSupplierResponse{
			ID:          supplier.ID,
			BranchID:    supplier.BranchID,
			Name:        supplier.Name,
			Description: supplier.Description,
			CreatedAt:   supplier.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   supplier.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
}

// GET /api/produce-suppliers?branch_id=...
func ListProduceSuppliersHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var suppliers []models.ProduceSupplier
		if err := database.DB.Where("branch_id = ?", branchID).
			Order("name asc").
			Find(&suppliers).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Tedarikçiler listelenemedi")
		}

		resp := make([]ProduceSupplierResponse, 0, len(suppliers))
		for _, s := range suppliers {
			resp = append(resp, ProduceSupplierResponse{
				ID:          s.ID,
				BranchID:    s.BranchID,
				Name:        s.Name,
				Description: s.Description,
				CreatedAt:   s.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				UpdatedAt:   s.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
			})
		}

		return c.JSON(resp)
	}
}

// PUT /api/produce-suppliers/:id
func UpdateProduceSupplierHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var supplier models.ProduceSupplier
		if err := database.DB.First(&supplier, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Tedarikçi bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != supplier.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu tedarikçiye erişim yetkiniz yok")
			}
		}

		var body UpdateProduceSupplierRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		beforeData := map[string]interface{}{
			"id":          supplier.ID,
			"name":        supplier.Name,
			"description": supplier.Description,
		}

		updated := false

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "isim boş olamaz")
			}
			supplier.Name = name
			updated = true
		}

		if body.Description != nil {
			supplier.Description = strings.TrimSpace(*body.Description)
			updated = true
		}

		if !updated {
			return c.JSON(ProduceSupplierResponse{
				ID:          supplier.ID,
				BranchID:    supplier.BranchID,
				Name:        supplier.Name,
				Description: supplier.Description,
				CreatedAt:   supplier.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				UpdatedAt:   supplier.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
			})
		}

		if err := database.DB.Save(&supplier).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Tedarikçi güncellenemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":          supplier.ID,
				"name":        supplier.Name,
				"description": supplier.Description,
			}
			branchIDForLog := &supplier.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "produce_supplier",
				EntityID:    supplier.ID,
				Action:      models.AuditActionUpdate,
				Description: fmt.Sprintf("Manav tedarikçi güncellendi: %s", supplier.Name),
				Before:      beforeData,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.JSON(ProduceSupplierResponse{
			ID:          supplier.ID,
			BranchID:    supplier.BranchID,
			Name:        supplier.Name,
			Description: supplier.Description,
			CreatedAt:   supplier.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   supplier.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
}

// DELETE /api/produce-suppliers/:id
func DeleteProduceSupplierHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var supplier models.ProduceSupplier
		if err := database.DB.First(&supplier, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Tedarikçi bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != supplier.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu tedarikçiye erişim yetkiniz yok")
			}
		}

		// İlişkili kayıtları da sil (tüm kayıtlarıyla birlikte)
		// Önce ilişkili kayıtları say (audit log için)
		var purchaseCount int64
		database.DB.Model(&models.ProducePurchase{}).Where("supplier_id = ?", supplier.ID).Count(&purchaseCount)
		var paymentCount int64
		database.DB.Model(&models.ProducePayment{}).Where("supplier_id = ?", supplier.ID).Count(&paymentCount)
		var wasteCount int64
		database.DB.Model(&models.ProduceWaste{}).Where("supplier_id = ?", supplier.ID).Count(&wasteCount)

		beforeData := map[string]interface{}{
			"id":             supplier.ID,
			"name":           supplier.Name,
			"description":    supplier.Description,
			"purchase_count": purchaseCount,
			"payment_count":  paymentCount,
			"waste_count":    wasteCount,
		}

		// Transaction başlat - tüm silme işlemlerini atomik yap
		tx := database.DB.Begin()
		if tx.Error != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşlem başlatılamadı")
		}

		// İlişkili kayıtları sil
		if purchaseCount > 0 {
			if err := tx.Where("supplier_id = ?", supplier.ID).Delete(&models.ProducePurchase{}).Error; err != nil {
				tx.Rollback()
				return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Alım kayıtları silinemedi: %v", err))
			}
		}

		if paymentCount > 0 {
			if err := tx.Where("supplier_id = ?", supplier.ID).Delete(&models.ProducePayment{}).Error; err != nil {
				tx.Rollback()
				return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Ödeme kayıtları silinemedi: %v", err))
			}
		}

		if wasteCount > 0 {
			if err := tx.Where("supplier_id = ?", supplier.ID).Delete(&models.ProduceWaste{}).Error; err != nil {
				tx.Rollback()
				return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Zayiat kayıtları silinemedi: %v", err))
			}
		}

		// Tedarikçiyi sil
		if err := tx.Delete(&supplier).Error; err != nil {
			tx.Rollback()
			return fiber.NewError(fiber.StatusInternalServerError, "Tedarikçi silinemedi")
		}

		// Transaction'ı commit et
		if err := tx.Commit().Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşlem tamamlanamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			totalDeleted := purchaseCount + paymentCount + wasteCount
			desc := fmt.Sprintf("Manav tedarikçi silindi: %s", supplier.Name)
			if totalDeleted > 0 {
				desc = fmt.Sprintf("Manav tedarikçi ve tüm kayıtları silindi: %s (%d alım, %d ödeme, %d zayiat)", 
					supplier.Name, purchaseCount, paymentCount, wasteCount)
			}
			
			branchIDForLog := &supplier.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "produce_supplier",
				EntityID:    supplier.ID,
				Action:      models.AuditActionDelete,
				Description: desc,
				Before:      beforeData,
				After:       nil,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

