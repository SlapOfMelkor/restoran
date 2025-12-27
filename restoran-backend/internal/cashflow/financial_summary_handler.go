package cashflow

import (
	"fmt"
	"time"

	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

// resolveBranchIDFromQueryOrRole: branch_id'yi query'den veya role'den çöz
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

type FinancialSummaryResponse struct {
	Period         string         `json:"period"` // "daily", "weekly", "monthly"
	StartDate      string         `json:"start_date"`
	EndDate        string         `json:"end_date"`
	TotalRevenue   float64        `json:"total_revenue"`             // toplam ciro
	TotalExpenses  float64        `json:"total_expenses"`            // toplam giderler
	ShipmentCosts  float64        `json:"shipment_costs"`            // sevkiyat maliyetleri
	CreditCardDebt float64        `json:"credit_card_debt"`          // kredi kartı borçları
	BankBalance    float64        `json:"bank_balance"`              // banka hesapları toplam bakiyesi
	NetProfit      float64        `json:"net_profit"`                // net kar
	DailyBreakdown []DailyRevenue `json:"daily_breakdown,omitempty"` // günlük detay (sadece daily/weekly için)
}

type DailyRevenue struct {
	Date          string  `json:"date"`
	Revenue       float64 `json:"revenue"`
	Expenses      float64 `json:"expenses"`
	ShipmentCosts float64 `json:"shipment_costs"`
}

// GET /api/financial-summary/daily
// Günlük ciro (tarih aralığı ile)
func GetDailyFinancialSummaryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		fromStr := c.Query("from")
		toStr := c.Query("to")
		if fromStr == "" || toStr == "" {
			return fiber.NewError(fiber.StatusBadRequest, "from ve to tarihleri zorunlu (YYYY-MM-DD)")
		}

		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "from tarihi geçersiz")
		}
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "to tarihi geçersiz")
		}

		// Günlük ciro (cash movements) - sadece girişler (direction = "in")
		var cashMovements []models.CashMovement
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ? AND direction = ?", branchID, from, to, "in").
			Find(&cashMovements)

		// Günlük giderler
		var expenses []models.Expense
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, from, to).
			Find(&expenses)

		// Günlük sevkiyat maliyetleri
		var shipments []models.Shipment
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, from, to).
			Find(&shipments)

		// Günlük breakdown oluştur
		dailyMap := make(map[string]DailyRevenue)
		current := from
		for !current.After(to) {
			dateStr := current.Format("2006-01-02")
			dailyMap[dateStr] = DailyRevenue{
				Date:          dateStr,
				Revenue:       0,
				Expenses:      0,
				ShipmentCosts: 0,
			}
			current = current.AddDate(0, 0, 1)
		}

		// Cash movements'ı ekle
		for _, cm := range cashMovements {
			dateStr := cm.Date.Format("2006-01-02")
			if dr, ok := dailyMap[dateStr]; ok {
				dr.Revenue += cm.Amount
				dailyMap[dateStr] = dr
			}
		}

		// Expenses'ı ekle
		for _, exp := range expenses {
			dateStr := exp.Date.Format("2006-01-02")
			if dr, ok := dailyMap[dateStr]; ok {
				dr.Expenses += exp.Amount
				dailyMap[dateStr] = dr
			}
		}

		// Shipments'ı ekle
		for _, sh := range shipments {
			dateStr := sh.Date.Format("2006-01-02")
			if dr, ok := dailyMap[dateStr]; ok {
				dr.ShipmentCosts += sh.TotalAmount
				dailyMap[dateStr] = dr
			}
		}

		// Map'i slice'a çevir
		dailyBreakdown := make([]DailyRevenue, 0, len(dailyMap))
		for _, dr := range dailyMap {
			dailyBreakdown = append(dailyBreakdown, dr)
		}

		// Toplamları hesapla
		var totalRevenue, totalExpenses, totalShipmentCosts float64
		for _, dr := range dailyBreakdown {
			totalRevenue += dr.Revenue
			totalExpenses += dr.Expenses
			totalShipmentCosts += dr.ShipmentCosts
		}

		return c.JSON(FinancialSummaryResponse{
			Period:         "daily",
			StartDate:      fromStr,
			EndDate:        toStr,
			TotalRevenue:   totalRevenue,
			TotalExpenses:  totalExpenses,
			ShipmentCosts:  totalShipmentCosts,
			NetProfit:      totalRevenue - totalExpenses - totalShipmentCosts,
			DailyBreakdown: dailyBreakdown,
		})
	}
}

// GET /api/financial-summary/weekly
// Haftalık ciro (hafta numarası ile)
func GetWeeklyFinancialSummaryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		yearStr := c.Query("year")
		weekStr := c.Query("week")
		if yearStr == "" || weekStr == "" {
			return fiber.NewError(fiber.StatusBadRequest, "year ve week zorunlu")
		}

		var year, week int
		if _, err := fmt.Sscan(yearStr, &year); err != nil || year < 2000 {
			return fiber.NewError(fiber.StatusBadRequest, "year geçersiz")
		}
		if _, err := fmt.Sscan(weekStr, &week); err != nil || week < 1 || week > 53 {
			return fiber.NewError(fiber.StatusBadRequest, "week geçersiz (1-53)")
		}

		// Haftanın ilk gününü bul (Pazartesi)
		jan1 := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
		weekday := jan1.Weekday()
		daysToMonday := (int(weekday) + 6) % 7 // Pazartesi'ye kadar gün sayısı
		firstMonday := jan1.AddDate(0, 0, -daysToMonday)

		// İstenen haftanın başlangıcı
		weekStart := firstMonday.AddDate(0, 0, (week-1)*7)
		weekEnd := weekStart.AddDate(0, 0, 6) // Pazar

		// Haftalık verileri topla - sadece girişler (direction = "in")
		var cashMovements []models.CashMovement
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ? AND direction = ?", branchID, weekStart, weekEnd, "in").
			Find(&cashMovements)

		var expenses []models.Expense
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, weekStart, weekEnd).
			Find(&expenses)

		var shipments []models.Shipment
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, weekStart, weekEnd).
			Find(&shipments)

		// Günlük breakdown
		dailyMap := make(map[string]DailyRevenue)
		current := weekStart
		for !current.After(weekEnd) {
			dateStr := current.Format("2006-01-02")
			dailyMap[dateStr] = DailyRevenue{
				Date:          dateStr,
				Revenue:       0,
				Expenses:      0,
				ShipmentCosts: 0,
			}
			current = current.AddDate(0, 0, 1)
		}

		for _, cm := range cashMovements {
			dateStr := cm.Date.Format("2006-01-02")
			if dr, ok := dailyMap[dateStr]; ok {
				dr.Revenue += cm.Amount
				dailyMap[dateStr] = dr
			}
		}

		for _, exp := range expenses {
			dateStr := exp.Date.Format("2006-01-02")
			if dr, ok := dailyMap[dateStr]; ok {
				dr.Expenses += exp.Amount
				dailyMap[dateStr] = dr
			}
		}

		for _, sh := range shipments {
			dateStr := sh.Date.Format("2006-01-02")
			if dr, ok := dailyMap[dateStr]; ok {
				dr.ShipmentCosts += sh.TotalAmount
				dailyMap[dateStr] = dr
			}
		}

		dailyBreakdown := make([]DailyRevenue, 0, len(dailyMap))
		for _, dr := range dailyMap {
			dailyBreakdown = append(dailyBreakdown, dr)
		}

		var totalRevenue, totalExpenses, totalShipmentCosts float64
		for _, dr := range dailyBreakdown {
			totalRevenue += dr.Revenue
			totalExpenses += dr.Expenses
			totalShipmentCosts += dr.ShipmentCosts
		}

		return c.JSON(FinancialSummaryResponse{
			Period:         "weekly",
			StartDate:      weekStart.Format("2006-01-02"),
			EndDate:        weekEnd.Format("2006-01-02"),
			TotalRevenue:   totalRevenue,
			TotalExpenses:  totalExpenses,
			ShipmentCosts:  totalShipmentCosts,
			NetProfit:      totalRevenue - totalExpenses - totalShipmentCosts,
			DailyBreakdown: dailyBreakdown,
		})
	}
}

// GET /api/financial-summary/monthly
// Aylık ciro ve kar
func GetMonthlyFinancialSummaryHandler() fiber.Handler {
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

		// Aylık veriler
		var cashMovements []models.CashMovement
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&cashMovements)

		var expenses []models.Expense
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&expenses)

		var shipments []models.Shipment
		database.DB.Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&shipments)

		// Banka hesapları ve kredi kartları
		var bankAccounts []models.BankAccount
		database.DB.Where("branch_id = ?", branchID).Find(&bankAccounts)

		var totalRevenue, totalExpenses, totalShipmentCosts float64
		var totalCreditCardDebt, totalBankBalance float64

		// Ciro - sadece girişler (direction = "in")
		for _, cm := range cashMovements {
			if cm.Direction == "in" {
				totalRevenue += cm.Amount
			}
		}

		// Giderler
		for _, exp := range expenses {
			totalExpenses += exp.Amount
		}

		// Sevkiyat maliyetleri
		for _, sh := range shipments {
			totalShipmentCosts += sh.TotalAmount
		}

		// Banka hesapları ve kredi kartları
		for _, acc := range bankAccounts {
			if acc.Type == models.AccountTypeCreditCard {
				// Kredi kartı borçları (negatif bakiye)
				if acc.Balance < 0 {
					totalCreditCardDebt += -acc.Balance
				}
			} else if acc.Type == models.AccountTypeBank {
				// Banka hesapları bakiyesi
				totalBankBalance += acc.Balance
			}
		}

		// Net kar = Ciro - Giderler - Sevkiyat maliyetleri
		netProfit := totalRevenue - totalExpenses - totalShipmentCosts

		return c.JSON(FinancialSummaryResponse{
			Period:         "monthly",
			StartDate:      firstDay.Format("2006-01-02"),
			EndDate:        lastDay.Format("2006-01-02"),
			TotalRevenue:   totalRevenue,
			TotalExpenses:  totalExpenses,
			ShipmentCosts:  totalShipmentCosts,
			CreditCardDebt: totalCreditCardDebt,
			BankBalance:    totalBankBalance,
			NetProfit:      netProfit,
		})
	}
}
