package cashflow

import (
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CreateCashMovementRequest struct {
	Date        *string           `json:"date"`   // "2025-12-09" formatında, boşsa bugün
	Method      models.CashMethod `json:"method"` // "cash" | "pos" | "yemeksepeti"
	Amount      float64           `json:"amount"`
	Description string            `json:"description"`
	// super_admin için opsiyonel:
	BranchID *uint `json:"branch_id"`
}

type CashMovementResponse struct {
	ID          uint              `json:"id"`
	BranchID    uint              `json:"branch_id"`
	Date        string            `json:"date"`
	Method      models.CashMethod `json:"method"`
	Amount      float64           `json:"amount"`
	Description string            `json:"description"`
}

type MonthlySummaryItem struct {
	Method models.CashMethod `json:"method"`
	Total  float64           `json:"total"`
}

type MonthlySummaryResponse struct {
	BranchID   uint                 `json:"branch_id"`
	Year       int                  `json:"year"`
	Month      int                  `json:"month"`
	Items      []MonthlySummaryItem `json:"items"`
	GrandTotal float64              `json:"grand_total"`
}

// Yardımcı: Kullanıcı bilgilerini al
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

// Yardımcı: context'ten branch id ve rolü çek
func getBranchIDForRequest(c *fiber.Ctx, bodyBranchID *uint) (uint, error) {
	role := c.Locals(auth.CtxUserRoleKey).(models.UserRole)

	if role == models.RoleBranchAdmin {
		// branch_admin ise, JWT'den branch id al
		branchIDPtr, ok := c.Locals(auth.CtxBranchIDKey).(*uint)
		if !ok || branchIDPtr == nil {
			return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
		}
		return *branchIDPtr, nil
	}

	// super_admin
	if bodyBranchID == nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
	}
	return *bodyBranchID, nil
}

// -------------------------------------------------
// POST /api/cash-movements
// -------------------------------------------------
func CreateCashMovementHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateCashMovementRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Tutar 0'dan büyük olmalı")
		}

		// method kontrol
		switch body.Method {
		case models.CashMethodCash, models.CashMethodPOS, models.CashMethodYemekSepeti:
			// ok
		default:
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz method (cash|pos|yemeksepeti)")
		}

		branchID, err := getBranchIDForRequest(c, body.BranchID)
		if err != nil {
			return err
		}

		// tarih
		var date time.Time
		if body.Date == nil || *body.Date == "" {
			// sadece tarih kısmını kullanmak için bugün 00:00
			now := time.Now()
			date = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		} else {
			d, err := time.Parse("2006-01-02", *body.Date)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı geçersiz, 'YYYY-MM-DD' olmalı")
			}
			date = d
		}

		mov := models.CashMovement{
			BranchID:    branchID,
			Date:        date,
			Method:      body.Method,
			Direction:   "in",
			Amount:      body.Amount,
			Description: body.Description,
		}

		if err := database.DB.Create(&mov).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kayıt oluşturulamadı")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			methodName := string(mov.Method)
			// Branch ilişkisini exclude et (JSON hatası önlemek için)
			afterData := map[string]interface{}{
				"id":          mov.ID,
				"branch_id":   mov.BranchID,
				"date":        mov.Date.Format("2006-01-02"),
				"method":      mov.Method,
				"direction":   mov.Direction,
				"amount":      mov.Amount,
				"description": mov.Description,
			}
			// mov.BranchID'yi kullan (super admin için getUserInfo null dönebilir)
			branchIDForLog := &mov.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "cash_movement",
				EntityID:    mov.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Ciro eklendi: %s - %.2f TL", methodName, mov.Amount),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				// Log hatası kritik değil, sadece log'la
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(CashMovementResponse{
			ID:          mov.ID,
			BranchID:    mov.BranchID,
			Date:        mov.Date.Format("2006-01-02"),
			Method:      mov.Method,
			Amount:      mov.Amount,
			Description: mov.Description,
		})
	}
}

// -------------------------------------------------
// GET /api/cash-movements?from=2025-12-01&to=2025-12-31&method=cash
// -------------------------------------------------
func ListCashMovementsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		role := c.Locals(auth.CtxUserRoleKey).(models.UserRole)

		var branchID uint
		if role == models.RoleBranchAdmin {
			branchIDPtr, ok := c.Locals(auth.CtxBranchIDKey).(*uint)
			if !ok || branchIDPtr == nil {
				return fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
			}
			branchID = *branchIDPtr
		} else {
			// super_admin: branch_id queryden gelir
			bidStr := c.Query("branch_id")
			if bidStr == "" {
				return fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
			}
			var parsed uint
			_, err := fmt.Sscan(bidStr, &parsed)
			if err != nil || parsed == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "branch_id geçersiz")
			}
			branchID = parsed
		}

		fromStr := c.Query("from")
		toStr := c.Query("to")
		methodStr := c.Query("method")

		dbq := database.DB.Model(&models.CashMovement{}).Where("branch_id = ?", branchID)

		if fromStr != "" {
			from, err := time.Parse("2006-01-02", fromStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "from tarihi geçersiz")
			}
			dbq = dbq.Where("date >= ?", from)
		}

		if toStr != "" {
			to, err := time.Parse("2006-01-02", toStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "to tarihi geçersiz")
			}
			dbq = dbq.Where("date <= ?", to)
		}

		if methodStr != "" {
			dbq = dbq.Where("method = ?", methodStr)
		}

		var movs []models.CashMovement
		if err := dbq.Order("date asc, id asc").Find(&movs).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kayıtlar listelenemedi")
		}

		resp := make([]CashMovementResponse, 0, len(movs))
		for _, m := range movs {
			resp = append(resp, CashMovementResponse{
				ID:          m.ID,
				BranchID:    m.BranchID,
				Date:        m.Date.Format("2006-01-02"),
				Method:      m.Method,
				Amount:      m.Amount,
				Description: m.Description,
			})
		}

		return c.JSON(resp)
	}
}

// -------------------------------------------------
// GET /api/cash-movements/summary/monthly?year=2025&month=12&branch_id=1
// branch_admin için branch_id query gerekmez (JWT’den)
// -------------------------------------------------
func MonthlySummaryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		role := c.Locals(auth.CtxUserRoleKey).(models.UserRole)

		var branchID uint
		if role == models.RoleBranchAdmin {
			branchIDPtr, ok := c.Locals(auth.CtxBranchIDKey).(*uint)
			if !ok || branchIDPtr == nil {
				return fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
			}
			branchID = *branchIDPtr
		} else {
			// super_admin
			bidStr := c.Query("branch_id")
			if bidStr == "" {
				return fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
			}
			var parsed uint
			_, err := fmt.Sscan(bidStr, &parsed)
			if err != nil || parsed == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "branch_id geçersiz")
			}
			branchID = parsed
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
		start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
		end := start.AddDate(0, 1, -1) // ilgili ayın son günü

		type row struct {
			Method string  `gorm:"column:method"`
			Total  float64 `gorm:"column:total"`
		}
		var rows []row

		if err := database.DB.Model(&models.CashMovement{}).
			Select("method, SUM(amount) as total").
			Where("branch_id = ? AND date >= ? AND date <= ? AND direction = ?", branchID, start, end, "in").
			Group("method").
			Scan(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Özet hesaplanamadı")
		}

		resp := MonthlySummaryResponse{
			BranchID:   branchID,
			Year:       year,
			Month:      month,
			Items:      make([]MonthlySummaryItem, 0, len(rows)),
			GrandTotal: 0,
		}

		for _, r := range rows {
			item := MonthlySummaryItem{
				Method: models.CashMethod(r.Method),
				Total:  r.Total,
			}
			resp.Items = append(resp.Items, item)
			resp.GrandTotal += r.Total
		}

		return c.JSON(resp)
	}
}
