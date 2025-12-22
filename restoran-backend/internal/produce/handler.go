package produce

import (
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

// -------------------------
// Request/Response Types
// -------------------------

type CreateProducePurchaseRequest struct {
	ProductID   uint    `json:"product_id"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	Date        string  `json:"date"` // "2025-12-09"
	Description string  `json:"description"`
	BranchID    *uint   `json:"branch_id"` // super_admin için opsiyonel
}

type ProducePurchaseResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	ProductUnit string  `json:"product_unit"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unit_price"`
	TotalAmount float64 `json:"total_amount"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
}

type CreateProducePaymentRequest struct {
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"` // "2025-12-09"
	Description string  `json:"description"`
	BranchID    *uint   `json:"branch_id"` // super_admin için opsiyonel
}

type ProducePaymentResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	Amount      float64 `json:"amount"`
	Date        string  `json:"date"`
	Description string  `json:"description"`
}

type ProduceBalanceResponse struct {
	BranchID          uint    `json:"branch_id"`
	TotalPurchases    float64 `json:"total_purchases"`
	TotalPayments     float64 `json:"total_payments"`
	RemainingDebt     float64 `json:"remaining_debt"`
}

type MonthlyProduceUsageItem struct {
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	TotalQty    float64 `json:"total_qty"`
	ProductUnit string  `json:"product_unit"`
	TotalAmount float64 `json:"total_amount"`
}

type MonthlyProduceUsageResponse struct {
	BranchID   uint                      `json:"branch_id"`
	Year       int                       `json:"year"`
	Month      int                       `json:"month"`
	Items      []MonthlyProduceUsageItem `json:"items"`
	GrandTotal float64                   `json:"grand_total"`
}

// -------------------------
// Yardımcı Fonksiyonlar
// -------------------------

func getUserInfo(c *fiber.Ctx) (uint, string, *uint, error) {
	userIDVal := c.Locals(auth.CtxUserIDKey)
	userID, ok := userIDVal.(uint)
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

// -------------------------
// Produce Purchase Handlers
// -------------------------

// POST /api/produce-purchases
func CreateProducePurchaseHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProducePurchaseRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.ProductID == 0 || body.Quantity <= 0 || body.UnitPrice <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "product_id, quantity ve unit_price zorunlu ve > 0 olmalı")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// Ürün var mı?
		var product models.ProduceProduct
		if err := database.DB.First(&product, "id = ?", body.ProductID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Manav ürünü bulunamadı")
		}

		totalAmount := body.Quantity * body.UnitPrice

		purchase := models.ProducePurchase{
			BranchID:    branchID,
			ProductID:   body.ProductID,
			Quantity:    body.Quantity,
			UnitPrice:   body.UnitPrice,
			TotalAmount: totalAmount,
			Date:        d,
			Description: body.Description,
		}

		if err := database.DB.Create(&purchase).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Alım kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":           purchase.ID,
				"branch_id":    purchase.BranchID,
				"product_id":   purchase.ProductID,
				"quantity":     purchase.Quantity,
				"unit_price":   purchase.UnitPrice,
				"total_amount": purchase.TotalAmount,
				"date":         purchase.Date.Format("2006-01-02"),
				"description":  purchase.Description,
			}
			branchIDForLog := &purchase.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "produce_purchase",
				EntityID:    purchase.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Manav alımı eklendi: %s - %.2f %s - %.2f TL", product.Name, purchase.Quantity, product.Unit, purchase.TotalAmount),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(ProducePurchaseResponse{
			ID:          purchase.ID,
			BranchID:    purchase.BranchID,
			ProductID:   purchase.ProductID,
			ProductName: product.Name,
			ProductUnit: product.Unit,
			Quantity:    purchase.Quantity,
			UnitPrice:   purchase.UnitPrice,
			TotalAmount: purchase.TotalAmount,
			Date:        purchase.Date.Format("2006-01-02"),
			Description: purchase.Description,
		})
	}
}

// GET /api/produce-purchases?branch_id=...&from=...&to=...&product_id=...
func ListProducePurchasesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		fromStr := c.Query("from")
		toStr := c.Query("to")
		productIDStr := c.Query("product_id")

		dbq := database.DB.Model(&models.ProducePurchase{}).
			Preload("Product").
			Where("branch_id = ?", branchID)

		if fromStr != "" {
			from, err := time.Parse("2006-01-02", fromStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "from geçersiz")
			}
			dbq = dbq.Where("date >= ?", from)
		}

		if toStr != "" {
			to, err := time.Parse("2006-01-02", toStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "to geçersiz")
			}
			dbq = dbq.Where("date <= ?", to)
		}

		if productIDStr != "" {
			var pid uint
			if _, err := fmt.Sscan(productIDStr, &pid); err != nil || pid == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "product_id geçersiz")
			}
			dbq = dbq.Where("product_id = ?", pid)
		}

		var rows []models.ProducePurchase
		if err := dbq.Order("date desc, id desc").Find(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Alımlar listelenemedi")
		}

		resp := make([]ProducePurchaseResponse, 0, len(rows))
		for _, r := range rows {
			resp = append(resp, ProducePurchaseResponse{
				ID:          r.ID,
				BranchID:    r.BranchID,
				ProductID:   r.ProductID,
				ProductName: r.Product.Name,
				ProductUnit: r.Product.Unit,
				Quantity:    r.Quantity,
				UnitPrice:   r.UnitPrice,
				TotalAmount: r.TotalAmount,
				Date:        r.Date.Format("2006-01-02"),
				Description: r.Description,
			})
		}

		return c.JSON(resp)
	}
}

// GET /api/produce-purchases/balance?branch_id=...
func GetProduceBalanceHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var totalPurchases float64
		if err := database.DB.Model(&models.ProducePurchase{}).
			Where("branch_id = ?", branchID).
			Select("COALESCE(SUM(total_amount), 0)").
			Scan(&totalPurchases).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Toplam alımlar hesaplanamadı")
		}

		var totalPayments float64
		if err := database.DB.Model(&models.ProducePayment{}).
			Where("branch_id = ?", branchID).
			Select("COALESCE(SUM(amount), 0)").
			Scan(&totalPayments).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Toplam ödemeler hesaplanamadı")
		}

		remainingDebt := totalPurchases - totalPayments

		return c.JSON(ProduceBalanceResponse{
			BranchID:       branchID,
			TotalPurchases: totalPurchases,
			TotalPayments:  totalPayments,
			RemainingDebt:  remainingDebt,
		})
	}
}

// GET /api/produce-purchases/monthly-usage?branch_id=...&year=2025&month=12
func GetMonthlyProduceUsageHandler() fiber.Handler {
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

		type row struct {
			ProductID   uint    `gorm:"column:product_id"`
			TotalQty    float64 `gorm:"column:total_qty"`
			TotalAmount float64 `gorm:"column:total_amount"`
		}
		var rows []row

		if err := database.DB.
			Model(&models.ProducePurchase{}).
			Select("product_id, SUM(quantity) as total_qty, SUM(total_amount) as total_amount").
			Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Group("product_id").
			Scan(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Aylık kullanım hesaplanamadı")
		}

		// Ürün bilgilerini çek
		productIDs := make([]uint, 0, len(rows))
		for _, r := range rows {
			productIDs = append(productIDs, r.ProductID)
		}

		var products []models.ProduceProduct
		if len(productIDs) > 0 {
			if err := database.DB.Where("id IN ?", productIDs).Find(&products).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Manav ürünleri yüklenemedi")
			}
		}

		productMap := make(map[uint]models.ProduceProduct)
		for _, p := range products {
			productMap[p.ID] = p
		}

		resp := MonthlyProduceUsageResponse{
			BranchID:   branchID,
			Year:       year,
			Month:      month,
			Items:      make([]MonthlyProduceUsageItem, 0, len(rows)),
			GrandTotal: 0,
		}

		for _, r := range rows {
			product, exists := productMap[r.ProductID]
			if !exists {
				continue // Ürün bulunamadı, atla
			}

			item := MonthlyProduceUsageItem{
				ProductID:   r.ProductID,
				ProductName: product.Name,
				ProductUnit: product.Unit,
				TotalQty:    r.TotalQty,
				TotalAmount: r.TotalAmount,
			}
			resp.Items = append(resp.Items, item)
			resp.GrandTotal += r.TotalAmount
		}

		return c.JSON(resp)
	}
}

// -------------------------
// Produce Payment Handlers
// -------------------------

// POST /api/produce-payments
func CreateProducePaymentHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateProducePaymentRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "amount zorunlu ve > 0 olmalı")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		payment := models.ProducePayment{
			BranchID:    branchID,
			Amount:      body.Amount,
			Date:        d,
			Description: body.Description,
		}

		if err := database.DB.Create(&payment).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ödeme kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":          payment.ID,
				"branch_id":   payment.BranchID,
				"amount":      payment.Amount,
				"date":        payment.Date.Format("2006-01-02"),
				"description": payment.Description,
			}
			branchIDForLog := &payment.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "produce_payment",
				EntityID:    payment.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Manav ödemesi eklendi: %.2f TL", payment.Amount),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(ProducePaymentResponse{
			ID:          payment.ID,
			BranchID:    payment.BranchID,
			Amount:      payment.Amount,
			Date:        payment.Date.Format("2006-01-02"),
			Description: payment.Description,
		})
	}
}

// GET /api/produce-payments?branch_id=...&from=...&to=...
func ListProducePaymentsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		fromStr := c.Query("from")
		toStr := c.Query("to")

		dbq := database.DB.Model(&models.ProducePayment{}).
			Where("branch_id = ?", branchID)

		if fromStr != "" {
			from, err := time.Parse("2006-01-02", fromStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "from geçersiz")
			}
			dbq = dbq.Where("date >= ?", from)
		}

		if toStr != "" {
			to, err := time.Parse("2006-01-02", toStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "to geçersiz")
			}
			dbq = dbq.Where("date <= ?", to)
		}

		var rows []models.ProducePayment
		if err := dbq.Order("date desc, id desc").Find(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ödemeler listelenemedi")
		}

		resp := make([]ProducePaymentResponse, 0, len(rows))
		for _, r := range rows {
			resp = append(resp, ProducePaymentResponse{
				ID:          r.ID,
				BranchID:    r.BranchID,
				Amount:      r.Amount,
				Date:        r.Date.Format("2006-01-02"),
				Description: r.Description,
			})
		}

		return c.JSON(resp)
	}
}

