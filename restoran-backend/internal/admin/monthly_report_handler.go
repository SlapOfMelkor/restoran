package admin

import (
	"encoding/json"
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CreateMonthlyReportRequest struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	BranchID *uint `json:"branch_id"` // super_admin için
}

type MonthlyReportResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	Year        int     `json:"year"`
	Month       int     `json:"month"`
	ReportDate  string  `json:"report_date"`
	TotalRevenue float64 `json:"total_revenue"`
	TotalExpenses float64 `json:"total_expenses"`
	TotalShipments float64 `json:"total_shipments"`
	NetProfit   float64 `json:"net_profit"`
	CreatedAt   string  `json:"created_at"`
}

// resolveBranchIDFromBodyOrRole: branch_id'yi body'den veya role'den çöz
func resolveBranchIDFromBodyOrRoleForReport(c *fiber.Ctx, bodyBranchID *uint) (uint, error) {
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

func resolveBranchIDFromQueryOrRoleForReport(c *fiber.Ctx) (uint, error) {
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

// getUserInfo: Kullanıcı bilgilerini al
func getUserInfoForReport(c *fiber.Ctx) (uint, string, *uint, error) {
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

// POST /api/admin/monthly-reports
// Aylık rapor oluştur ve verileri sıfırla
func CreateMonthlyReportHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateMonthlyReportRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.Year < 2000 || body.Month < 1 || body.Month > 12 {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz yıl veya ay")
		}

		branchID, err := resolveBranchIDFromBodyOrRoleForReport(c, body.BranchID)
		if err != nil {
			return err
		}

		// Bu ay için rapor zaten var mı kontrol et
		var existingReport models.MonthlyReport
		err = database.DB.Where("branch_id = ? AND year = ? AND month = ?", branchID, body.Year, body.Month).
			First(&existingReport).Error
		if err == nil {
			return fiber.NewError(fiber.StatusBadRequest, "Bu ay için rapor zaten oluşturulmuş")
		}

		loc := time.Now().Location()
		firstDay := time.Date(body.Year, time.Month(body.Month), 1, 0, 0, 0, 0, loc)
		lastDay := firstDay.AddDate(0, 1, -1)

		// Aylık verileri topla
		var cashMovements []models.CashMovement
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&cashMovements)

		var expenses []models.Expense
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&expenses)

		var shipments []models.Shipment
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&shipments)

		var totalRevenue, totalExpenses, totalShipments float64
		for _, cm := range cashMovements {
			totalRevenue += cm.Amount
		}
		for _, exp := range expenses {
			totalExpenses += exp.Amount
		}
		for _, sh := range shipments {
			totalShipments += sh.TotalAmount
		}

		netProfit := totalRevenue - totalExpenses - totalShipments

		// Detaylı rapor verileri (JSON)
		reportData := map[string]interface{}{
			"cash_movements": cashMovements,
			"expenses":       expenses,
			"shipments":      shipments,
		}
		reportDataJSON, _ := json.Marshal(reportData)

		// Rapor oluştur
		report := models.MonthlyReport{
			BranchID:      branchID,
			Year:          body.Year,
			Month:         body.Month,
			ReportDate:    time.Now(),
			TotalRevenue:  totalRevenue,
			TotalExpenses: totalExpenses,
			TotalShipments: totalShipments,
			NetProfit:     netProfit,
			ReportData:    string(reportDataJSON),
		}

		if err := database.DB.Create(&report).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Rapor oluşturulamadı")
		}

		// Verileri sıfırla (sil)
		// Transaction içinde yap
		tx := database.DB.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Cash movements sil
		if err := tx.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Delete(&models.CashMovement{}).Error; err != nil {
			tx.Rollback()
			return fiber.NewError(fiber.StatusInternalServerError, "Veriler sıfırlanamadı")
		}

		// Expenses sil
		if err := tx.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Delete(&models.Expense{}).Error; err != nil {
			tx.Rollback()
			return fiber.NewError(fiber.StatusInternalServerError, "Veriler sıfırlanamadı")
		}

		// Shipments sil (items cascade ile silinir)
		if err := tx.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Delete(&models.Shipment{}).Error; err != nil {
			tx.Rollback()
			return fiber.NewError(fiber.StatusInternalServerError, "Veriler sıfırlanamadı")
		}

		// Stock entries sil
		if err := tx.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Delete(&models.StockEntry{}).Error; err != nil {
			tx.Rollback()
			return fiber.NewError(fiber.StatusInternalServerError, "Veriler sıfırlanamadı")
		}

		// Audit logs sil (opsiyonel - geriye dönük takip için tutulabilir)
		// Şimdilik siliyoruz ama istenirse tutulabilir
		if err := tx.Where("branch_id = ? AND created_at >= ? AND created_at <= ?", branchID, firstDay, lastDay.AddDate(0, 0, 1)).
			Delete(&models.AuditLog{}).Error; err != nil {
			tx.Rollback()
			return fiber.NewError(fiber.StatusInternalServerError, "Veriler sıfırlanamadı")
		}

		if err := tx.Commit().Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Veriler sıfırlanamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfoForReport(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &branchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "monthly_report",
				EntityID:    report.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Aylık rapor oluşturuldu ve veriler sıfırlandı: %d/%d", body.Month, body.Year),
				Before:      nil,
				After:       report,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(MonthlyReportResponse{
			ID:            report.ID,
			BranchID:      report.BranchID,
			Year:          report.Year,
			Month:         report.Month,
			ReportDate:    report.ReportDate.Format("2006-01-02 15:04:05"),
			TotalRevenue:  report.TotalRevenue,
			TotalExpenses: report.TotalExpenses,
			TotalShipments: report.TotalShipments,
			NetProfit:     report.NetProfit,
			CreatedAt:     report.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/admin/monthly-reports
// Raporları listele
func ListMonthlyReportsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRoleForReport(c)
		if err != nil {
			return err
		}

		var reports []models.MonthlyReport
		if err := database.DB.
			Where("branch_id = ?", branchID).
			Order("year DESC, month DESC").
			Find(&reports).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Raporlar listelenemedi")
		}

		resp := make([]MonthlyReportResponse, 0, len(reports))
		for _, r := range reports {
			resp = append(resp, MonthlyReportResponse{
				ID:            r.ID,
				BranchID:      r.BranchID,
				Year:          r.Year,
				Month:         r.Month,
				ReportDate:    r.ReportDate.Format("2006-01-02 15:04:05"),
				TotalRevenue:  r.TotalRevenue,
				TotalExpenses: r.TotalExpenses,
				TotalShipments: r.TotalShipments,
				NetProfit:     r.NetProfit,
				CreatedAt:     r.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(resp)
	}
}

// GET /api/admin/monthly-reports/:id
// Rapor detayını getir
func GetMonthlyReportHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var report models.MonthlyReport
		if err := database.DB.First(&report, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Rapor bulunamadı")
		}

		// Branch kontrolü
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if ok && role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if ok && bPtr != nil && *bPtr != report.BranchID {
				return fiber.NewError(fiber.StatusForbidden, "Bu rapora erişim yetkiniz yok")
			}
		}

		var reportData map[string]interface{}
		if report.ReportData != "" {
			if err := json.Unmarshal([]byte(report.ReportData), &reportData); err != nil {
				// JSON parse hatası varsa boş map döndür
				reportData = make(map[string]interface{})
			}
		} else {
			// ReportData boşsa boş map döndür
			reportData = make(map[string]interface{})
		}

		return c.JSON(fiber.Map{
			"id":             report.ID,
			"branch_id":     report.BranchID,
			"year":           report.Year,
			"month":          report.Month,
			"report_date":   report.ReportDate.Format("2006-01-02 15:04:05"),
			"total_revenue":  report.TotalRevenue,
			"total_expenses": report.TotalExpenses,
			"total_shipments": report.TotalShipments,
			"net_profit":     report.NetProfit,
			"report_data":    reportData,
			"created_at":     report.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

