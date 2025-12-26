package trade

import (
	"fmt"
	"strings"
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

type CreateTradeTransactionRequest struct {
	Type        string  `json:"type"`        // "receivable" veya "payable"
	Amount      float64 `json:"amount"`      // Toplam tutar
	Description string  `json:"description"` // Açıklama
	Date        string  `json:"date"`        // "2025-12-09"
	BranchID    *uint   `json:"branch_id"`   // super_admin için opsiyonel
}

type UpdateTradeTransactionRequest struct {
	Type        *string  `json:"type"`
	Amount      *float64 `json:"amount"`
	Description *string  `json:"description"`
	Date        *string  `json:"date"`
}

type TradeTransactionResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	Type        string  `json:"type"`        // "receivable" veya "payable"
	Amount      float64 `json:"amount"`      // Toplam tutar
	Description string  `json:"description"`
	Date        string  `json:"date"`
	TotalPaid   float64 `json:"total_paid"`   // Toplam ödenen/alınan
	Remaining   float64 `json:"remaining"`    // Kalan tutar
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type CreateTradePaymentRequest struct {
	TradeTransactionID uint    `json:"trade_transaction_id"`
	Amount             float64 `json:"amount"`      // Ödeme tutarı
	PaymentDate        string  `json:"payment_date"` // "2025-12-09"
	Description        string  `json:"description"`  // Ödeme açıklaması (taksit bilgisi vs.)
	BranchID           *uint   `json:"branch_id"`    // super_admin için opsiyonel
}

type TradePaymentResponse struct {
	ID                 uint    `json:"id"`
	BranchID           uint    `json:"branch_id"`
	TradeTransactionID uint    `json:"trade_transaction_id"`
	Amount             float64 `json:"amount"`
	PaymentDate        string  `json:"payment_date"`
	Description        string  `json:"description"`
	CreatedAt          string  `json:"created_at"`
}

// -------------------------
// Yardımcı: Kullanıcı bilgilerini al
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

// -------------------------
// Yardımcı: branch ID çöz
// -------------------------

// body'den gelen branch_id + role
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

// query'den gelen branch_id + role
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
// Trade Transaction CRUD
// -------------------------

// POST /api/trades
func CreateTradeTransactionHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateTradeTransactionRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		// Validasyon
		if body.Type != string(models.TradeTypeReceivable) && body.Type != string(models.TradeTypePayable) {
			return fiber.NewError(fiber.StatusBadRequest, "type 'receivable' veya 'payable' olmalı")
		}
		if body.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "amount 0'dan büyük olmalı")
		}
		if strings.TrimSpace(body.Description) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "description boş olamaz")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		tx := models.TradeTransaction{
			BranchID:    branchID,
			Type:        models.TradeTransactionType(body.Type),
			Amount:      body.Amount,
			Description: strings.TrimSpace(body.Description),
			Date:        d,
		}

		if err := database.DB.Create(&tx).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşlem kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			typeLabel := "Alacak"
			if tx.Type == models.TradeTypePayable {
				typeLabel = "Verecek"
			}
			afterData := map[string]interface{}{
				"id":          tx.ID,
				"branch_id":   tx.BranchID,
				"type":        string(tx.Type),
				"amount":      tx.Amount,
				"description": tx.Description,
				"date":        tx.Date.Format("2006-01-02"),
			}
			branchIDForLog := &tx.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "trade_transaction",
				EntityID:    tx.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("%s eklendi: %.2f TL - %s", typeLabel, tx.Amount, tx.Description),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		// Response oluştur (henüz ödeme yok, total_paid = 0)
		return c.Status(fiber.StatusCreated).JSON(TradeTransactionResponse{
			ID:          tx.ID,
			BranchID:    tx.BranchID,
			Type:        string(tx.Type),
			Amount:      tx.Amount,
			Description: tx.Description,
			Date:        tx.Date.Format("2006-01-02"),
			TotalPaid:   0,
			Remaining:   tx.Amount,
			CreatedAt:   tx.CreatedAt.Format(time.RFC3339),
			UpdatedAt:   tx.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// GET /api/trades?branch_id=...&type=...
func ListTradeTransactionsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		typeFilter := c.Query("type") // "receivable" veya "payable"

		dbq := database.DB.Model(&models.TradeTransaction{}).
			Where("branch_id = ?", branchID)

		if typeFilter != "" {
			if typeFilter != string(models.TradeTypeReceivable) && typeFilter != string(models.TradeTypePayable) {
				return fiber.NewError(fiber.StatusBadRequest, "type 'receivable' veya 'payable' olmalı")
			}
			dbq = dbq.Where("type = ?", typeFilter)
		}

		var transactions []models.TradeTransaction
		if err := dbq.Preload("Payments").Order("date desc, id desc").Find(&transactions).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşlemler listelenemedi")
		}

		resp := make([]TradeTransactionResponse, 0, len(transactions))
		for _, tx := range transactions {
			// Toplam ödenen/alınan tutarı hesapla
			totalPaid := 0.0
			for _, payment := range tx.Payments {
				totalPaid += payment.Amount
			}
			remaining := tx.Amount - totalPaid

			resp = append(resp, TradeTransactionResponse{
				ID:          tx.ID,
				BranchID:    tx.BranchID,
				Type:        string(tx.Type),
				Amount:      tx.Amount,
				Description: tx.Description,
				Date:        tx.Date.Format("2006-01-02"),
				TotalPaid:   totalPaid,
				Remaining:   remaining,
				CreatedAt:   tx.CreatedAt.Format(time.RFC3339),
				UpdatedAt:   tx.UpdatedAt.Format(time.RFC3339),
			})
		}

		return c.JSON(resp)
	}
}

// PUT /api/trades/:id
func UpdateTradeTransactionHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var tx models.TradeTransaction
		if err := database.DB.First(&tx, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşlem bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != tx.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu işleme erişim yetkiniz yok")
			}
		}

		var body UpdateTradeTransactionRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		beforeData := map[string]interface{}{
			"id":          tx.ID,
			"type":        string(tx.Type),
			"amount":      tx.Amount,
			"description": tx.Description,
			"date":        tx.Date.Format("2006-01-02"),
		}

		updated := false

		if body.Type != nil {
			typeStr := strings.TrimSpace(*body.Type)
			if typeStr != string(models.TradeTypeReceivable) && typeStr != string(models.TradeTypePayable) {
				return fiber.NewError(fiber.StatusBadRequest, "type 'receivable' veya 'payable' olmalı")
			}
			tx.Type = models.TradeTransactionType(typeStr)
			updated = true
		}

		if body.Amount != nil {
			if *body.Amount <= 0 {
				return fiber.NewError(fiber.StatusBadRequest, "amount 0'dan büyük olmalı")
			}
			tx.Amount = *body.Amount
			updated = true
		}

		if body.Description != nil {
			desc := strings.TrimSpace(*body.Description)
			if desc == "" {
				return fiber.NewError(fiber.StatusBadRequest, "description boş olamaz")
			}
			tx.Description = desc
			updated = true
		}

		if body.Date != nil {
			d, err := time.Parse("2006-01-02", *body.Date)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
			}
			tx.Date = d
			updated = true
		}

		if !updated {
			return c.JSON(TradeTransactionResponse{
				ID:          tx.ID,
				BranchID:    tx.BranchID,
				Type:        string(tx.Type),
				Amount:      tx.Amount,
				Description: tx.Description,
				Date:        tx.Date.Format("2006-01-02"),
				TotalPaid:   0,
				Remaining:   tx.Amount,
				CreatedAt:   tx.CreatedAt.Format(time.RFC3339),
				UpdatedAt:   tx.UpdatedAt.Format(time.RFC3339),
			})
		}

		if err := database.DB.Save(&tx).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşlem güncellenemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			afterData := map[string]interface{}{
				"id":          tx.ID,
				"type":        string(tx.Type),
				"amount":      tx.Amount,
				"description": tx.Description,
				"date":        tx.Date.Format("2006-01-02"),
			}
			typeLabel := "Alacak"
			if tx.Type == models.TradeTypePayable {
				typeLabel = "Verecek"
			}
			branchIDForLog := &tx.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "trade_transaction",
				EntityID:    tx.ID,
				Action:      models.AuditActionUpdate,
				Description: fmt.Sprintf("%s güncellendi", typeLabel),
				Before:      beforeData,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		// Toplam ödenen tutarı hesapla
		var payments []models.TradePayment
		database.DB.Where("trade_transaction_id = ?", tx.ID).Find(&payments)
		totalPaid := 0.0
		for _, p := range payments {
			totalPaid += p.Amount
		}
		remaining := tx.Amount - totalPaid

		return c.JSON(TradeTransactionResponse{
			ID:          tx.ID,
			BranchID:    tx.BranchID,
			Type:        string(tx.Type),
			Amount:      tx.Amount,
			Description: tx.Description,
			Date:        tx.Date.Format("2006-01-02"),
			TotalPaid:   totalPaid,
			Remaining:   remaining,
			CreatedAt:   tx.CreatedAt.Format(time.RFC3339),
			UpdatedAt:   tx.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// DELETE /api/trades/:id
func DeleteTradeTransactionHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")
		var tx models.TradeTransaction
		if err := database.DB.First(&tx, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşlem bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != tx.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu işleme erişim yetkiniz yok")
			}
		}

		// Ödemeler varsa silme (CASCADE constraint ile otomatik)
		// Ama kontrol edelim
		var paymentCount int64
		database.DB.Model(&models.TradePayment{}).Where("trade_transaction_id = ?", tx.ID).Count(&paymentCount)
		if paymentCount > 0 {
			// Önce ödemeleri sil
			database.DB.Where("trade_transaction_id = ?", tx.ID).Delete(&models.TradePayment{})
		}

		beforeData := map[string]interface{}{
			"id":          tx.ID,
			"type":        string(tx.Type),
			"amount":      tx.Amount,
			"description": tx.Description,
			"date":        tx.Date.Format("2006-01-02"),
		}

		if err := database.DB.Delete(&tx).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşlem silinemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			typeLabel := "Alacak"
			if tx.Type == models.TradeTypePayable {
				typeLabel = "Verecek"
			}
			branchIDForLog := &tx.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "trade_transaction",
				EntityID:    tx.ID,
				Action:      models.AuditActionDelete,
				Description: fmt.Sprintf("%s silindi: %.2f TL", typeLabel, tx.Amount),
				Before:      beforeData,
				After:       nil,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

// -------------------------
// Trade Payment CRUD
// -------------------------

// POST /api/trades/:id/payments
func CreateTradePaymentHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		txID := c.Params("id")
		var tx models.TradeTransaction
		if err := database.DB.First(&tx, "id = ?", txID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşlem bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != tx.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu işleme erişim yetkiniz yok")
			}
		}

		var body CreateTradePaymentRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "amount 0'dan büyük olmalı")
		}

		// Toplam ödenen tutarı kontrol et
		var existingPayments []models.TradePayment
		database.DB.Where("trade_transaction_id = ?", tx.ID).Find(&existingPayments)
		totalPaid := 0.0
		for _, p := range existingPayments {
			totalPaid += p.Amount
		}

		if totalPaid+body.Amount > tx.Amount {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Toplam ödeme tutarı (%.2f TL) işlem tutarını (%.2f TL) aşamaz", totalPaid+body.Amount, tx.Amount))
		}

		paymentDate, err := time.Parse("2006-01-02", body.PaymentDate)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		payment := models.TradePayment{
			BranchID:           tx.BranchID,
			TradeTransactionID: tx.ID,
			Amount:             body.Amount,
			PaymentDate:        paymentDate,
			Description:        strings.TrimSpace(body.Description),
		}

		if err := database.DB.Create(&payment).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ödeme kaydedilemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			typeLabel := "Alacak"
			if tx.Type == models.TradeTypePayable {
				typeLabel = "Verecek"
			}
			afterData := map[string]interface{}{
				"id":                 payment.ID,
				"trade_transaction_id": payment.TradeTransactionID,
				"amount":             payment.Amount,
				"payment_date":       payment.PaymentDate.Format("2006-01-02"),
				"description":        payment.Description,
			}
			branchIDForLog := &tx.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "trade_payment",
				EntityID:    payment.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("%s için ödeme eklendi: %.2f TL - %s", typeLabel, payment.Amount, payment.Description),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(TradePaymentResponse{
			ID:                 payment.ID,
			BranchID:           payment.BranchID,
			TradeTransactionID: payment.TradeTransactionID,
			Amount:             payment.Amount,
			PaymentDate:        payment.PaymentDate.Format("2006-01-02"),
			Description:        payment.Description,
			CreatedAt:          payment.CreatedAt.Format(time.RFC3339),
		})
	}
}

// GET /api/trades/:id/payments
func ListTradePaymentsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		txID := c.Params("id")
		var tx models.TradeTransaction
		if err := database.DB.First(&tx, "id = ?", txID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "İşlem bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != tx.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu işleme erişim yetkiniz yok")
			}
		}

		var payments []models.TradePayment
		if err := database.DB.Where("trade_transaction_id = ?", tx.ID).
			Order("payment_date desc, id desc").
			Find(&payments).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ödemeler listelenemedi")
		}

		resp := make([]TradePaymentResponse, 0, len(payments))
		for _, p := range payments {
			resp = append(resp, TradePaymentResponse{
				ID:                 p.ID,
				BranchID:           p.BranchID,
				TradeTransactionID: p.TradeTransactionID,
				Amount:             p.Amount,
				PaymentDate:        p.PaymentDate.Format("2006-01-02"),
				Description:        p.Description,
				CreatedAt:          p.CreatedAt.Format(time.RFC3339),
			})
		}

		return c.JSON(resp)
	}
}

// DELETE /api/trades/:id/payments/:payment_id
func DeleteTradePaymentHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		paymentID := c.Params("payment_id")
		var payment models.TradePayment
		if err := database.DB.First(&payment, "id = ?", paymentID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Ödeme bulunamadı")
		}

		// Şube kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil || *bPtr != payment.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu ödemeye erişim yetkiniz yok")
			}
		}

		beforeData := map[string]interface{}{
			"id":          payment.ID,
			"amount":      payment.Amount,
			"payment_date": payment.PaymentDate.Format("2006-01-02"),
			"description": payment.Description,
		}

		if err := database.DB.Delete(&payment).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ödeme silinemedi")
		}

		// Audit log
		var tx models.TradeTransaction
		database.DB.First(&tx, payment.TradeTransactionID)
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			typeLabel := "Alacak"
			if tx.Type == models.TradeTypePayable {
				typeLabel = "Verecek"
			}
			branchIDForLog := &payment.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "trade_payment",
				EntityID:    payment.ID,
				Action:      models.AuditActionDelete,
				Description: fmt.Sprintf("%s için ödeme silindi: %.2f TL", typeLabel, payment.Amount),
				Before:      beforeData,
				After:       nil,
			}); logErr != nil {
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

