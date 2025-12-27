package produce

import (
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type ProduceWasteResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	PurchaseID  *uint   `json:"purchase_id"`
	Quantity    float64 `json:"quantity"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
	CreatedAt   string  `json:"created_at"`
}

type CreateProduceWasteRequest struct {
	SupplierID  uint    `json:"supplier_id"` // ProduceSupplier ID
	ProductID   uint    `json:"product_id"`
	PurchaseID  *uint   `json:"purchase_id"` // Opsiyonel
	Quantity    float64 `json:"quantity"`
	Date        string  `json:"date"` // "2025-12-09"
	Description string  `json:"description"`
	BranchID    *uint   `json:"branch_id"` // super_admin için opsiyonel
}

type UpdateProduceWasteRequest struct {
	ProductID   *uint    `json:"product_id"`
	PurchaseID  *uint    `json:"purchase_id"`
	Quantity    *float64 `json:"quantity"`
	Date        *string  `json:"date"`
	Description *string  `json:"description"`
}

// getUserInfo fonksiyonu handler.go'da tanımlı, burada kullanıyoruz
// resolveBranchIDFromBodyOrRole ve resolveBranchIDFromQueryOrRole fonksiyonları handler.go'da tanımlı

// POST /api/produce-waste
func CreateProduceWasteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProduceWasteRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.SupplierID == 0 || body.ProductID == 0 || body.Quantity <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "supplier_id, product_id ve quantity zorunlu ve quantity 0'dan büyük olmalı")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// Tedarikçi var mı ve bu şubeye ait mi?
		var supplier models.ProduceSupplier
		if err := database.DB.First(&supplier, "id = ? AND branch_id = ?", body.SupplierID, branchID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tedarikçi bulunamadı veya bu şubeye ait değil")
		}

		// Ürün var mı?
		var product models.ProduceProduct
		if err := database.DB.First(&product, "id = ?", body.ProductID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Manav ürünü bulunamadı")
		}

		// PurchaseID varsa kontrol et (supplier_id uyumlu olmalı)
		if body.PurchaseID != nil && *body.PurchaseID > 0 {
			var purchase models.ProducePurchase
			if err := database.DB.First(&purchase, "id = ?", *body.PurchaseID).Error; err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Alım kaydı bulunamadı")
			}
			if purchase.SupplierID != body.SupplierID {
				return fiber.NewError(fiber.StatusBadRequest, "Alım kaydı seçilen tedarikçiye ait değil")
			}
		}

		waste := models.ProduceWaste{
			BranchID:    branchID,
			SupplierID:  body.SupplierID,
			ProductID:   body.ProductID,
			PurchaseID:  body.PurchaseID, // zaten *uint
			Quantity:    body.Quantity,
			Date:        d,
			Description: body.Description,
		}

		if err := database.DB.Create(&waste).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat kaydı oluşturulamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &branchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "produce_waste",
				EntityID:    waste.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Manav zayiatı: %s - %.2f %s", product.Name, waste.Quantity, product.Unit),
				Before:      nil,
				After:       waste,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(ProduceWasteResponse{
			ID:          waste.ID,
			BranchID:    waste.BranchID,
			ProductID:   waste.ProductID,
			ProductName: product.Name,
			PurchaseID:  waste.PurchaseID,
			Quantity:    waste.Quantity,
			Date:        waste.Date.Format("2006-01-02"),
			Description: waste.Description,
			CreatedAt:   waste.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/produce-waste
func ListProduceWasteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		supplierIDStr := c.Query("supplier_id")

		dbq := database.DB.
			Preload("Product").
			Where("branch_id = ?", branchID)

		if supplierIDStr != "" {
			var sid uint
			if _, err := fmt.Sscan(supplierIDStr, &sid); err != nil || sid == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "supplier_id geçersiz")
			}
			dbq = dbq.Where("supplier_id = ?", sid)
		}

		var wastes []models.ProduceWaste
		if err := dbq.Order("date DESC, created_at DESC").Find(&wastes).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat kayıtları listelenemedi")
		}

		res := make([]ProduceWasteResponse, 0, len(wastes))
		for _, w := range wastes {
			res = append(res, ProduceWasteResponse{
				ID:          w.ID,
				BranchID:    w.BranchID,
				ProductID:   w.ProductID,
				ProductName: w.Product.Name,
				PurchaseID:  w.PurchaseID,
				Quantity:    w.Quantity,
				Date:        w.Date.Format("2006-01-02"),
				Description: w.Description,
				CreatedAt:   w.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(res)
	}
}

// PUT /api/produce-waste/:id
func UpdateProduceWasteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var waste models.ProduceWaste
		if err := database.DB.First(&waste, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Zayiat kaydı bulunamadı")
		}

		var body UpdateProduceWasteRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.ProductID != nil {
			var product models.ProduceProduct
			if err := database.DB.First(&product, "id = ?", *body.ProductID).Error; err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Manav ürünü bulunamadı")
			}
			waste.ProductID = *body.ProductID
		}

		if body.PurchaseID != nil {
			if *body.PurchaseID > 0 {
				var purchase models.ProducePurchase
				if err := database.DB.First(&purchase, "id = ?", *body.PurchaseID).Error; err != nil {
					return fiber.NewError(fiber.StatusBadRequest, "Alım kaydı bulunamadı")
				}
				waste.PurchaseID = body.PurchaseID
			} else {
				waste.PurchaseID = nil
			}
		}

		if body.Quantity != nil {
			if *body.Quantity <= 0 {
				return fiber.NewError(fiber.StatusBadRequest, "Quantity 0'dan büyük olmalı")
			}
			waste.Quantity = *body.Quantity
		}

		if body.Date != nil {
			d, err := time.Parse("2006-01-02", *body.Date)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
			}
			waste.Date = d
		}

		if body.Description != nil {
			waste.Description = *body.Description
		}

		if err := database.DB.Save(&waste).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat kaydı güncellenemedi")
		}

		// Product bilgisini çek
		var product models.ProduceProduct
		database.DB.First(&product, "id = ?", waste.ProductID)

		return c.JSON(ProduceWasteResponse{
			ID:          waste.ID,
			BranchID:    waste.BranchID,
			ProductID:   waste.ProductID,
			ProductName: product.Name,
			PurchaseID:  waste.PurchaseID,
			Quantity:    waste.Quantity,
			Date:        waste.Date.Format("2006-01-02"),
			Description: waste.Description,
			CreatedAt:   waste.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// DELETE /api/produce-waste/:id
func DeleteProduceWasteHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		if err := database.DB.Delete(&models.ProduceWaste{}, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Zayiat kaydı silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

