package inventory

import (
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CreateWasteEntryRequest struct {
	Date     string  `json:"date"`      // "2025-12-09"
	ProductID uint   `json:"product_id"` // zorunlu
	Quantity float64 `json:"quantity"`   // zorunlu, zayiat miktarı
	Note     string  `json:"note"`       // zorunlu: hangi garson/mutfakçı sebep oldu
	BranchID *uint   `json:"branch_id"`  // super_admin için
}

type WasteEntryResponse struct {
	ID         uint    `json:"id"`
	BranchID   uint    `json:"branch_id"`
	ProductID  uint    `json:"product_id"`
	ProductName string `json:"product_name"`
	Date       string  `json:"date"`
	Quantity   float64 `json:"quantity"`
	Note       string  `json:"note"`
	CreatedAt  string  `json:"created_at"`
}

// Yardımcı: Kullanıcı bilgilerini al
func getUserInfoForWaste(c *fiber.Ctx) (uint, string, *uint, error) {
	userIDVal := c.Locals(auth.CtxUserRoleKey)
	_, ok := userIDVal.(models.UserRole)
	if !ok {
		return 0, "", nil, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	userIDVal2 := c.Locals(auth.CtxUserIDKey)
	userID, ok := userIDVal2.(uint)
	if !ok {
		return 0, "", nil, fiber.NewError(fiber.StatusForbidden, "Kullanıcı bilgisi alınamadı")
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return 0, "", nil, fiber.NewError(fiber.StatusInternalServerError, "Kullanıcı bulunamadı")
	}

	var branchID *uint
	bVal := c.Locals(auth.CtxBranchIDKey)
	if bPtr, ok := bVal.(*uint); ok && bPtr != nil {
		branchID = bPtr
	}

	return userID, user.Name, branchID, nil
}

// POST /api/waste-entries
func CreateWasteEntryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateWasteEntryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		// Validasyonlar
		if body.ProductID == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "product_id zorunludur")
		}
		if body.Quantity <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "quantity 0'dan büyük olmalıdır")
		}
		if body.Note == "" || len(body.Note) < 3 {
			return fiber.NewError(fiber.StatusBadRequest, "note zorunludur ve en az 3 karakter olmalıdır (hangi garson/mutfakçı sebep oldu)")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		// Branch kontrolü
		var branch models.Branch
		if err := database.DB.First(&branch, "id = ?", branchID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Şube bulunamadı (ID: %d)", branchID))
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// Ürün kontrolü
		var product models.Product
		if err := database.DB.First(&product, "id = ?", body.ProductID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Ürün bulunamadı")
		}

		// Zayiat girişi oluştur
		entry := models.WasteEntry{
			BranchID:  branchID,
			ProductID: body.ProductID,
			Date:      d,
			Quantity:  body.Quantity,
			Note:      body.Note,
		}

		if err := database.DB.Create(&entry).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat girişi oluşturulamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfoForWaste(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &branchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "waste_entry",
				EntityID:    entry.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Zayiat girişi: %s - %.2f %s (Not: %s)", product.Name, entry.Quantity, product.Unit, entry.Note),
				Before:      nil,
				After:       entry,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(WasteEntryResponse{
			ID:          entry.ID,
			BranchID:    entry.BranchID,
			ProductID:   entry.ProductID,
			ProductName: product.Name,
			Date:        entry.Date.Format("2006-01-02"),
			Quantity:    entry.Quantity,
			Note:        entry.Note,
			CreatedAt:   entry.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/waste-entries
func ListWasteEntriesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		// Tarih filtresi (opsiyonel)
		dateFrom := c.Query("date_from")
		dateTo := c.Query("date_to")

		query := database.DB.Preload("Product").
			Where("branch_id = ?", branchID)

		if dateFrom != "" {
			if d, err := time.Parse("2006-01-02", dateFrom); err == nil {
				query = query.Where("date >= ?", d)
			}
		}
		if dateTo != "" {
			if d, err := time.Parse("2006-01-02", dateTo); err == nil {
				// Tarih sonuna kadar (23:59:59)
				d = d.Add(24*time.Hour - time.Second)
				query = query.Where("date <= ?", d)
			}
		}

		var entries []models.WasteEntry
		if err := query.Order("date DESC, created_at DESC").Find(&entries).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat girişleri listelenemedi")
		}

		resp := make([]WasteEntryResponse, 0, len(entries))
		for _, e := range entries {
			resp = append(resp, WasteEntryResponse{
				ID:          e.ID,
				BranchID:    e.BranchID,
				ProductID:   e.ProductID,
				ProductName: e.Product.Name,
				Date:        e.Date.Format("2006-01-02"),
				Quantity:    e.Quantity,
				Note:        e.Note,
				CreatedAt:   e.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(resp)
	}
}

// GET /api/waste-entries/:id
func GetWasteEntryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var entry models.WasteEntry
		if err := database.DB.Preload("Product").First(&entry, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Zayiat girişi bulunamadı")
		}

		return c.JSON(WasteEntryResponse{
			ID:          entry.ID,
			BranchID:    entry.BranchID,
			ProductID:   entry.ProductID,
			ProductName: entry.Product.Name,
			Date:        entry.Date.Format("2006-01-02"),
			Quantity:    entry.Quantity,
			Note:        entry.Note,
			CreatedAt:   entry.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// DELETE /api/waste-entries/:id
func DeleteWasteEntryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var entry models.WasteEntry
		if err := database.DB.First(&entry, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Zayiat girişi bulunamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfoForWaste(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &entry.BranchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "waste_entry",
				EntityID:    entry.ID,
				Action:      models.AuditActionDelete,
				Description: fmt.Sprintf("Zayiat girişi silindi: %s - %.2f", entry.Note, entry.Quantity),
				Before:      entry,
				After:       nil,
			})
		}

		if err := database.DB.Delete(&entry).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat girişi silinemedi")
		}

		return c.JSON(fiber.Map{
			"message": "Zayiat girişi başarıyla silindi",
		})
	}
}

