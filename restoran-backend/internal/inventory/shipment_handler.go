package inventory

import (
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

// CreateShipmentRequest: Yeni sevkiyat oluşturma
type CreateShipmentRequest struct {
	Date     string                `json:"date"`  // "2025-12-09"
	Items    []ShipmentItemRequest `json:"items"` // ürün listesi
	Note     string                `json:"note"`
	BranchID *uint                 `json:"branch_id"` // super_admin için
}

type ShipmentItemRequest struct {
	ProductID   uint    `json:"product_id"`   // 0 ise otomatik oluşturulacak
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	// Otomatik ürün oluşturma için (product_id = 0 olduğunda)
	ProductName string `json:"product_name"`  // Ürün adı
	StockCode   string `json:"stock_code"`    // Stok kodu
	Unit        string `json:"unit"`          // Birim (Paket, Koli, Adet, Kilogram)
}

// ShipmentResponse: Sevkiyat yanıtı
type ShipmentResponse struct {
	ID          uint                   `json:"id"`
	BranchID    uint                   `json:"branch_id"`
	Date        string                 `json:"date"`
	TotalAmount float64                `json:"total_amount"`
	IsStocked   bool                   `json:"is_stocked"`
	Note        string                 `json:"note"`
	Items       []ShipmentItemResponse `json:"items"`
	CreatedAt   string                 `json:"created_at"`
}

type ShipmentItemResponse struct {
	ID          uint    `json:"id"`
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	TotalPrice  float64 `json:"total_price"`
}

// POST /api/shipments
func CreateShipmentHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateShipmentRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if len(body.Items) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "En az bir ürün eklenmelidir")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// Toplam tutarı hesapla ve ürünleri kontrol et
		var totalAmount float64
		var shipmentItems []models.ShipmentItem

		for _, itemReq := range body.Items {
			if itemReq.Quantity <= 0 || itemReq.UnitPrice <= 0 {
				return fiber.NewError(fiber.StatusBadRequest, "Tüm ürünler için quantity ve unit_price zorunlu ve 0'dan büyük olmalı")
			}

			var product models.Product
			
			// Eğer product_id = 0 ise, ürünü otomatik oluştur
			if itemReq.ProductID == 0 {
				if itemReq.ProductName == "" || itemReq.Unit == "" {
					return fiber.NewError(fiber.StatusBadRequest, "Yeni ürün için product_name ve unit zorunlu")
				}
				
				// Stok kodu varsa, aynı stok kodlu ürün var mı kontrol et
				if itemReq.StockCode != "" {
					var existingProduct models.Product
					if err := database.DB.Where("stock_code = ?", itemReq.StockCode).First(&existingProduct).Error; err == nil {
						// Stok kodu ile eşleşen ürün bulundu, onu kullan
						product = existingProduct
					} else {
						// Yeni ürün oluştur
						product = models.Product{
							Name:            itemReq.ProductName,
							Unit:            itemReq.Unit,
							StockCode:       itemReq.StockCode,
							IsCenterProduct: true,
						}
						if err := database.DB.Create(&product).Error; err != nil {
							return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Ürün oluşturulamadı: %v", err))
						}
					}
				} else {
					// Stok kodu yoksa, sadece isim ve birimle oluştur
					product = models.Product{
						Name:            itemReq.ProductName,
						Unit:            itemReq.Unit,
						StockCode:       "",
						IsCenterProduct: true,
					}
					if err := database.DB.Create(&product).Error; err != nil {
						return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("Ürün oluşturulamadı: %v", err))
					}
				}
			} else {
				// Mevcut ürünü kullan
				if err := database.DB.First(&product, "id = ?", itemReq.ProductID).Error; err != nil {
					return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Ürün bulunamadı: %d", itemReq.ProductID))
				}
			}

			totalPrice := itemReq.Quantity * itemReq.UnitPrice
			totalAmount += totalPrice

			// Yeni oluşturulan ürün için product.ID kullan, aksi halde itemReq.ProductID kullan
			productID := itemReq.ProductID
			if itemReq.ProductID == 0 {
				productID = product.ID // Yeni oluşturulan ürünün ID'sini kullan
			}

			shipmentItems = append(shipmentItems, models.ShipmentItem{
				ProductID:  productID,
				Quantity:   itemReq.Quantity,
				UnitPrice:  itemReq.UnitPrice,
				TotalPrice: totalPrice,
			})
		}

		// Sevkiyat oluştur
		shipment := models.Shipment{
			BranchID:    branchID,
			Date:        d,
			TotalAmount: totalAmount,
			IsStocked:   false,
			Note:        body.Note,
			Items:       shipmentItems,
		}

		if err := database.DB.Create(&shipment).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Sevkiyat oluşturulamadı")
		}

		// Items'ları tekrar yükle (ID'ler için)
		if err := database.DB.Preload("Product").Where("shipment_id = ?", shipment.ID).Find(&shipment.Items).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Sevkiyat ürünleri yüklenemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &branchID, // Sevkiyatın branch_id'sini kullan
				UserID:      userID,
				UserName:    userName,
				EntityType:  "shipment",
				EntityID:    shipment.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Sevkiyat eklendi: %d ürün, Toplam: %.2f TL", len(shipment.Items), shipment.TotalAmount),
				Before:      nil,
				After:       shipment,
			})
		}

		// Response oluştur
		itemsResp := make([]ShipmentItemResponse, 0, len(shipment.Items))
		for _, item := range shipment.Items {
			itemsResp = append(itemsResp, ShipmentItemResponse{
				ID:          item.ID,
				ProductID:   item.ProductID,
				ProductName: item.Product.Name,
				Quantity:    item.Quantity,
				UnitPrice:   item.UnitPrice,
				TotalPrice:  item.TotalPrice,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(ShipmentResponse{
			ID:          shipment.ID,
			BranchID:    shipment.BranchID,
			Date:        shipment.Date.Format("2006-01-02"),
			TotalAmount: shipment.TotalAmount,
			IsStocked:   shipment.IsStocked,
			Note:        shipment.Note,
			Items:       itemsResp,
			CreatedAt:   shipment.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/shipments
func ListShipmentsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var shipments []models.Shipment
		if err := database.DB.
			Preload("Items.Product").
			Where("branch_id = ?", branchID).
			Order("date DESC, created_at DESC").
			Find(&shipments).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Sevkiyatlar listelenemedi")
		}

		resp := make([]ShipmentResponse, 0, len(shipments))
		for _, s := range shipments {
			itemsResp := make([]ShipmentItemResponse, 0, len(s.Items))
			for _, item := range s.Items {
				itemsResp = append(itemsResp, ShipmentItemResponse{
					ID:          item.ID,
					ProductID:   item.ProductID,
					ProductName: item.Product.Name,
					Quantity:    item.Quantity,
					UnitPrice:   item.UnitPrice,
					TotalPrice:  item.TotalPrice,
				})
			}

			resp = append(resp, ShipmentResponse{
				ID:          s.ID,
				BranchID:    s.BranchID,
				Date:        s.Date.Format("2006-01-02"),
				TotalAmount: s.TotalAmount,
				IsStocked:   s.IsStocked,
				Note:        s.Note,
				Items:       itemsResp,
				CreatedAt:   s.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(resp)
	}
}

// POST /api/shipments/:id/stock
// Sevkiyatı stoka kaydet
func StockShipmentHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var shipment models.Shipment
		if err := database.DB.Preload("Items.Product").First(&shipment, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Sevkiyat bulunamadı")
		}

		if shipment.IsStocked {
			return fiber.NewError(fiber.StatusBadRequest, "Bu sevkiyat zaten stoka kaydedilmiş")
		}

		// Sevkiyat stoka kaydedildiğinde StockEntry oluşturma
		// Sadece IsStocked flag'ini güncelle
		// Mevcut stok hesaplaması GetCurrentStockHandler'da yapılacak:
		// En son manuel sayım + (sayımdan sonra gelen sevkiyatlar)

		// Sevkiyatı stoka kaydedildi olarak işaretle
		shipment.IsStocked = true
		if err := database.DB.Save(&shipment).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Sevkiyat güncellenemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &shipment.BranchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "shipment",
				EntityID:    shipment.ID,
				Action:      models.AuditActionUpdate,
				Description: fmt.Sprintf("Sevkiyat stoka kaydedildi"),
				Before:      nil,
				After:       shipment,
			})
		}

		return c.JSON(fiber.Map{
			"message":     "Sevkiyat başarıyla stoka kaydedildi",
			"shipment_id": shipment.ID,
		})
	}
}
