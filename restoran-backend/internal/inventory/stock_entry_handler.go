package inventory

import (
	"fmt"
	"sort"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CreateStockEntryRequest struct {
	Date            string  `json:"date"` // "2025-12-09"
	ProductID       uint    `json:"product_id"`
	Quantity        float64 `json:"quantity"`         // Sayım miktarı (yeni stok durumu)
	CurrentQuantity float64 `json:"current_quantity"` // Mevcut stok (frontend'den gelen)
	BranchID        *uint   `json:"branch_id"`        // super_admin için
}

type StockEntryResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	StockCode   string  `json:"stock_code"`
	Date        string  `json:"date"`
	Quantity    float64 `json:"quantity"`
	Note        string  `json:"note"`
	CreatedAt   string  `json:"created_at"`
}

// Yardımcı: Kullanıcı bilgilerini al
func getUserInfoForStock(c *fiber.Ctx) (uint, string, *uint, error) {
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

// POST /api/stock-entries
func CreateStockEntryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateStockEntryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.ProductID == 0 || body.Quantity < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "product_id zorunlu, quantity negatif olamaz")
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

		// Mevcut stok bilgisini hesapla (GetCurrentStockHandler mantığı ile aynı)
		// En son manuel stok sayımını bul
		var lastCountEntry models.StockEntry
		err = database.DB.
			Where("branch_id = ? AND product_id = ?", branchID, body.ProductID).
			Order("date DESC, created_at DESC").
			First(&lastCountEntry).Error

		baseQuantity := 0.0
		countCreatedAt := time.Time{}
		if err == nil {
			baseQuantity = lastCountEntry.Quantity
			countCreatedAt = lastCountEntry.CreatedAt
		}

		// En son sayımdan sonra stoka kaydedilmiş sevkiyatları topla
		// Önemli: Sevkiyat tarihine değil, stoka kaydedilme zamanına (updated_at) bakıyoruz
		var shipmentsAfterCount []models.Shipment
		shipmentQuantity := 0.0
		if err == nil {
			// Sayım oluşturulma zamanından sonra stoka kaydedilmiş sevkiyatlar (updated_at > countCreatedAt)
			err = database.DB.
				Preload("Items", "product_id = ?", body.ProductID).
				Where("branch_id = ? AND updated_at > ? AND is_stocked = true", branchID, countCreatedAt).
				Find(&shipmentsAfterCount).Error
			if err == nil {
				for _, shipment := range shipmentsAfterCount {
					for _, item := range shipment.Items {
						if item.ProductID == body.ProductID {
							shipmentQuantity += item.Quantity
						}
					}
				}
			}
		} else {
			// Hiç stok sayımı yoksa, tüm stoka kaydedilmiş sevkiyatları topla
			err = database.DB.
				Preload("Items", "product_id = ?", body.ProductID).
				Where("branch_id = ? AND is_stocked = true", branchID).
				Find(&shipmentsAfterCount).Error
			if err == nil {
				for _, shipment := range shipmentsAfterCount {
					for _, item := range shipment.Items {
						if item.ProductID == body.ProductID {
							shipmentQuantity += item.Quantity
						}
					}
				}
			}
		}

		// Backend'deki mevcut stok = En son sayım + (sayımdan sonra gelen sevkiyatlar)
		backendCurrentQuantity := baseQuantity + shipmentQuantity

		// Frontend'den gelen mevcut stok ile backend'deki mevcut stok uyumlu mu kontrol et
		// (Eğer farklıysa, başka bir kullanıcı aynı anda güncelleme yapmış olabilir)
		if body.CurrentQuantity != backendCurrentQuantity {
			// Uyumsuzluk var, ama yine de kaydet (kullanıcı uyarısı frontend'de yapılabilir)
			// Şimdilik direkt kaydediyoruz
		}

		// Stok girişi oluştur (sayım miktarı = yeni stok durumu)
		entry := models.StockEntry{
			BranchID:  branchID,
			ProductID: body.ProductID,
			Date:      d,
			Quantity:  body.Quantity, // Sayım sonucu = yeni stok durumu
		}

		if err := database.DB.Create(&entry).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Stok girişi oluşturulamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfoForStock(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &branchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "stock_entry",
				EntityID:    entry.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Stok sayımı: %s - %.2f %s", product.Name, entry.Quantity, product.Unit),
				Before:      nil,
				After:       entry,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(StockEntryResponse{
			ID:          entry.ID,
			BranchID:    entry.BranchID,
			ProductID:   entry.ProductID,
			ProductName: product.Name,
			StockCode:   product.StockCode,
			Date:        entry.Date.Format("2006-01-02"),
			Quantity:    entry.Quantity,
			Note:        entry.Note,
			CreatedAt:   entry.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/stock-entries
func ListStockEntriesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var entries []models.StockEntry
		if err := database.DB.
			Preload("Product").
			Where("branch_id = ?", branchID).
			Order("date DESC, created_at DESC").
			Find(&entries).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Stok girişleri listelenemedi")
		}

		resp := make([]StockEntryResponse, 0, len(entries))
		for _, e := range entries {
			resp = append(resp, StockEntryResponse{
				ID:          e.ID,
				BranchID:    e.BranchID,
				ProductID:   e.ProductID,
				ProductName: e.Product.Name,
				StockCode:   e.Product.StockCode,
				Date:        e.Date.Format("2006-01-02"),
				Quantity:    e.Quantity,
				Note:        e.Note,
				CreatedAt:   e.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(resp)
	}
}

// GET /api/stock-entries/current
// Mevcut stok durumunu getir
// Mantık: En son manuel stok sayımı + (sayımdan sonra gelen sevkiyatlar)
func GetCurrentStockHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		// Her ürün için mevcut stoku hesapla
		var products []models.Product
		if err := database.DB.Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
		}

		// Sıralama bilgisini al (varsa)
		var orderMap map[uint]int = make(map[uint]int)
		var branchOrders []models.BranchProductOrder
		if err := database.DB.Where("branch_id = ?", branchID).Find(&branchOrders).Error; err == nil {
			for _, order := range branchOrders {
				orderMap[order.ProductID] = order.OrderIndex
			}
		}

		type CurrentStock struct {
			ProductID   uint    `json:"product_id"`
			ProductName string  `json:"product_name"`
			StockCode   string  `json:"stock_code"`
			Unit        string  `json:"unit"`
			Quantity    float64 `json:"quantity"`
			LastUpdate  string  `json:"last_update"`
			OrderIndex  *int    `json:"order_index,omitempty"` // Sıralama için (nil ise sıralama yok)
		}

		currentStocks := make([]CurrentStock, 0)
		for _, product := range products {
			// En son manuel stok sayımını bul (en son StockEntry)
			var lastCountEntry models.StockEntry
			err := database.DB.
				Where("branch_id = ? AND product_id = ?", branchID, product.ID).
				Order("date DESC, created_at DESC").
				First(&lastCountEntry).Error

			baseQuantity := 0.0
			countCreatedAt := time.Time{}
			if err == nil {
				baseQuantity = lastCountEntry.Quantity
				countCreatedAt = lastCountEntry.CreatedAt
			}

			// En son sayımdan sonra stoka kaydedilmiş sevkiyatları topla
			// Önemli: Sevkiyat tarihine değil, stoka kaydedilme zamanına (updated_at) bakıyoruz
			// Çünkü sevkiyat tarihi önce olabilir ama stoka kaydedilme zamanı sonra olabilir
			var shipmentsAfterCount []models.Shipment
			shipmentQuantity := 0.0
			if err == nil {
				// Sayım oluşturulma zamanından sonra stoka kaydedilmiş sevkiyatlar (updated_at > countCreatedAt)
				// updated_at, IsStocked=true yapıldığında güncellenir
				// countCreatedAt kullanıyoruz çünkü stok sayımı oluşturulduğu anda kesin sonuç olur
				err = database.DB.
					Preload("Items", "product_id = ?", product.ID).
					Where("branch_id = ? AND updated_at > ? AND is_stocked = true", branchID, countCreatedAt).
					Find(&shipmentsAfterCount).Error
				if err == nil {
					for _, shipment := range shipmentsAfterCount {
						for _, item := range shipment.Items {
							if item.ProductID == product.ID {
								shipmentQuantity += item.Quantity
							}
						}
					}
				}
			} else {
				// Hiç stok sayımı yoksa, tüm stoka kaydedilmiş sevkiyatları topla
				err = database.DB.
					Preload("Items", "product_id = ?", product.ID).
					Where("branch_id = ? AND is_stocked = true", branchID).
					Find(&shipmentsAfterCount).Error
				if err == nil {
					for _, shipment := range shipmentsAfterCount {
						for _, item := range shipment.Items {
							if item.ProductID == product.ID {
								shipmentQuantity += item.Quantity
							}
						}
					}
				}
			}

			// Toplam stok = En son sayım + (sayımdan sonra gelen sevkiyatlar)
			totalQuantity := baseQuantity + shipmentQuantity

			lastUpdate := ""
			if err == nil {
				lastUpdate = lastCountEntry.Date.Format("2006-01-02")
			} else if len(shipmentsAfterCount) > 0 {
				// Sadece sevkiyat varsa, en son sevkiyat tarihini göster
				lastShipment := shipmentsAfterCount[0]
				for _, s := range shipmentsAfterCount {
					if s.Date.After(lastShipment.Date) {
						lastShipment = s
					}
				}
				lastUpdate = lastShipment.Date.Format("2006-01-02")
			}

			orderIdx := orderMap[product.ID]
			var orderIdxPtr *int
			if _, hasOrder := orderMap[product.ID]; hasOrder {
				orderIdxPtr = &orderIdx
			}

			currentStocks = append(currentStocks, CurrentStock{
				ProductID:   product.ID,
				ProductName: product.Name,
				StockCode:   product.StockCode,
				Unit:        product.Unit,
				Quantity:    totalQuantity,
				LastUpdate:  lastUpdate,
				OrderIndex:  orderIdxPtr,
			})
		}

		// Sıralamaya göre sort et (order_index olanlar önce, sonra diğerleri)
		// Go'da slice sort için sort.Slice kullan
		sort.Slice(currentStocks, func(i, j int) bool {
			iOrder := currentStocks[i].OrderIndex
			jOrder := currentStocks[j].OrderIndex

			// İkisi de sıralama varsa, order_index'e göre
			if iOrder != nil && jOrder != nil {
				return *iOrder < *jOrder
			}
			// Sadece i sıralama varsa, i önce gelsin
			if iOrder != nil {
				return true
			}
			// Sadece j sıralama varsa, j önce gelsin
			if jOrder != nil {
				return false
			}
			// İkisi de yoksa, ürün adına göre alfabetik
			return currentStocks[i].ProductName < currentStocks[j].ProductName
		})

		return c.JSON(currentStocks)
	}
}

// GET /api/stock-usage/monthly
// Aylık harcama raporu: Başlangıç + Gelen - Son = Harcanan
func GetMonthlyStockUsageHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		yearStr := c.Query("year")
		monthStr := c.Query("month")
		if yearStr == "" || monthStr == "" {
			return fiber.NewError(fiber.StatusBadRequest, "year ve month zorunlu")
		}

		var year, month int
		if _, err := fmt.Sscan(yearStr, &year); err != nil || year < 2000 {
			return fiber.NewError(fiber.StatusBadRequest, "year geçersiz")
		}
		if _, err := fmt.Sscan(monthStr, &month); err != nil || month < 1 || month > 12 {
			return fiber.NewError(fiber.StatusBadRequest, "month geçersiz")
		}

		loc := time.Now().Location()
		firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
		lastDay := firstDay.AddDate(0, 1, -1)

		// Ay başındaki stok (ayın ilk gününden önceki en son stok girişi)
		// Ay içindeki sevkiyatlar (stoka kaydedilmiş olanlar + center shipments)
		// Ay sonundaki stok (ayın son günündeki veya sonrasındaki en son stok girişi)

		// Geri alınan (undo edilen) sevkiyatların ID'lerini bul
		type UndoneLog struct {
			EntityID uint `gorm:"column:entity_id"`
		}
		var undoneShipmentIDs []UndoneLog
		var undoneCenterShipmentIDs []UndoneLog
		
		// Geri alınan Shipment'ları bul
		database.DB.Model(&models.AuditLog{}).
			Select("entity_id").
			Where("entity_type = ? AND action = ? AND is_undone = ? AND (branch_id = ? OR branch_id IS NULL)", 
				"shipment", models.AuditActionCreate, true, branchID).
			Scan(&undoneShipmentIDs)
		
		// Geri alınan CenterShipment'ları bul
		database.DB.Model(&models.AuditLog{}).
			Select("entity_id").
			Where("entity_type = ? AND action = ? AND is_undone = ? AND (branch_id = ? OR branch_id IS NULL)", 
				"center_shipment", models.AuditActionCreate, true, branchID).
			Scan(&undoneCenterShipmentIDs)
		
		undoneShipmentIDMap := make(map[uint]bool)
		for _, log := range undoneShipmentIDs {
			undoneShipmentIDMap[log.EntityID] = true
		}
		
		undoneCenterShipmentIDMap := make(map[uint]bool)
		for _, log := range undoneCenterShipmentIDs {
			undoneCenterShipmentIDMap[log.EntityID] = true
		}

		// Tüm ürünleri al (sadece merkez ürünleri)
		var products []models.Product
		if err := database.DB.Where("is_center_product = ?", true).Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
		}

		type StockUsageRow struct {
			ProductID    uint    `json:"product_id"`
			ProductName  string  `json:"product_name"`
			StockCode    string  `json:"stock_code"`
			Unit         string  `json:"unit"`
			StartQty     float64 `json:"start_qty"`     // ay başı stok
			IncomingQty  float64 `json:"incoming_qty"`  // ay içi gelen (sevkiyat)
			EndQty       float64 `json:"end_qty"`       // ay sonu stok
			UsedQty      float64 `json:"used_qty"`      // harcanan = start + incoming - end
		}

		rows := make([]StockUsageRow, 0)
		for _, product := range products {
			// Ay başı stok (ayın ilk gününden önceki en son giriş)
			var startEntry models.StockEntry
			startQty := 0.0
			err := database.DB.
				Where("branch_id = ? AND product_id = ? AND date < ?", branchID, product.ID, firstDay).
				Order("date DESC, created_at DESC").
				First(&startEntry).Error
			if err == nil {
				startQty = startEntry.Quantity
			}

			// Ay içi gelen sevkiyatlar (stoka kaydedilmiş) - geri alınanları hariç tut
			incomingQty := 0.0
			
			// 1. Shipment'lar (B2B sevkiyatlar)
			var incomingShipments []models.Shipment
			err = database.DB.
				Preload("Items", "product_id = ?", product.ID).
				Where("branch_id = ? AND date >= ? AND date <= ? AND is_stocked = true", branchID, firstDay, lastDay).
				Find(&incomingShipments).Error
			if err == nil {
				for _, shipment := range incomingShipments {
					// Geri alınmış sevkiyatları atla
					if undoneShipmentIDMap[shipment.ID] {
						continue
					}
					for _, item := range shipment.Items {
						if item.ProductID == product.ID {
							incomingQty += item.Quantity
						}
					}
				}
			}
			
			// 2. CenterShipment'lar (manuel merkez sevkiyatları) - geri alınanları hariç tut
			var centerShipments []models.CenterShipment
			err = database.DB.
				Where("branch_id = ? AND product_id = ? AND date >= ? AND date <= ?", branchID, product.ID, firstDay, lastDay).
				Find(&centerShipments).Error
			if err == nil {
				for _, cs := range centerShipments {
					// Geri alınmış sevkiyatları atla
					if undoneCenterShipmentIDMap[cs.ID] {
						continue
					}
					incomingQty += cs.Quantity
				}
			}

			// Ay sonu stok (ayın son günündeki veya sonrasındaki en son giriş)
			var endEntry models.StockEntry
			endQty := 0.0
			err = database.DB.
				Where("branch_id = ? AND product_id = ? AND date >= ?", branchID, product.ID, firstDay).
				Order("date DESC, created_at DESC").
				First(&endEntry).Error
			if err == nil {
				endQty = endEntry.Quantity
			}

			// Harcanan = Başlangıç + Gelen - Son
			usedQty := startQty + incomingQty - endQty
			if usedQty < 0 {
				usedQty = 0 // Negatif olamaz (muhtemelen veri hatası)
			}

			rows = append(rows, StockUsageRow{
				ProductID:   product.ID,
				ProductName: product.Name,
				StockCode:   product.StockCode,
				Unit:        product.Unit,
				StartQty:    startQty,
				IncomingQty: incomingQty,
				EndQty:      endQty,
				UsedQty:     usedQty,
			})
		}

		return c.JSON(fiber.Map{
			"year": year,
			"month": month,
			"branch_id": branchID,
			"rows": rows,
		})
	}
}

// GET /api/stock-entries/usage-between-counts
// Son iki stok sayımı arasındaki kullanımı hesapla
// Mantık: (Önceki sayım + Aradaki sevkiyatlar) - Son sayım = Kullanım
func GetStockUsageBetweenCountsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		// Tüm ürünleri al (sadece IsCenterProduct = true olanlar)
		var products []models.Product
		if err := database.DB.Where("is_center_product = ?", true).Find(&products).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ürünler listelenemedi")
		}

		type UsageRow struct {
			ProductID          uint    `json:"product_id"`
			ProductName        string  `json:"product_name"`
			Unit               string  `json:"unit"`
			PreviousCount      float64 `json:"previous_count"`      // Önceki sayım miktarı
			PreviousCountDate  string  `json:"previous_count_date"` // Önceki sayım tarihi
			ShipmentsBetween   float64 `json:"shipments_between"`   // İki sayım arası gelen sevkiyatlar
			CurrentCount       float64 `json:"current_count"`       // Son sayım miktarı
			CurrentCountDate   string  `json:"current_count_date"`  // Son sayım tarihi
			Usage              float64 `json:"usage"`               // Kullanım = (Önceki + Sevkiyat) - Son
		}

		rows := make([]UsageRow, 0)
		for _, product := range products {
			// En son iki stok sayımını bul
			var stockEntries []models.StockEntry
			err := database.DB.
				Where("branch_id = ? AND product_id = ?", branchID, product.ID).
				Order("date DESC, created_at DESC").
				Limit(2).
				Find(&stockEntries).Error

			if err != nil || len(stockEntries) < 2 {
				// En az 2 sayım yoksa, bu ürün için kullanım hesaplanamaz
				continue
			}

			// En son sayım (index 0)
			currentEntry := stockEntries[0]
			// Önceki sayım (index 1)
			previousEntry := stockEntries[1]

			// İki sayım arasındaki sevkiyatları bul
			// Önceki sayımın oluşturulma zamanından sonra, son sayımın oluşturulma zamanından önce
			// stoka kaydedilmiş sevkiyatlar
			var shipmentsBetween []models.Shipment
			shipmentQuantity := 0.0
			err = database.DB.
				Preload("Items", "product_id = ?", product.ID).
				Where("branch_id = ? AND updated_at > ? AND updated_at < ? AND is_stocked = true", 
					branchID, previousEntry.CreatedAt, currentEntry.CreatedAt).
				Find(&shipmentsBetween).Error
			
			if err == nil {
				for _, shipment := range shipmentsBetween {
					for _, item := range shipment.Items {
						if item.ProductID == product.ID {
							shipmentQuantity += item.Quantity
						}
					}
				}
			}

			// Kullanım = (Önceki sayım + Aradaki sevkiyatlar) - Son sayım
			usage := previousEntry.Quantity + shipmentQuantity - currentEntry.Quantity
			if usage < 0 {
				usage = 0 // Negatif olamaz
			}

			rows = append(rows, UsageRow{
				ProductID:         product.ID,
				ProductName:       product.Name,
				Unit:              product.Unit,
				PreviousCount:     previousEntry.Quantity,
				PreviousCountDate: previousEntry.Date.Format("2006-01-02"),
				ShipmentsBetween:  shipmentQuantity,
				CurrentCount:      currentEntry.Quantity,
				CurrentCountDate:  currentEntry.Date.Format("2006-01-02"),
				Usage:             usage,
			})
		}

		return c.JSON(fiber.Map{
			"branch_id": branchID,
			"rows":      rows,
		})
	}
}

