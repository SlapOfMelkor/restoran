package financial

import (
	"fmt"
	"time"

	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type MethodRevenue struct {
	Method models.CashMethod `json:"method"`
	Total  float64           `json:"total"`
}

type ExpenseByCategory struct {
	CategoryID   uint    `json:"category_id"`
	CategoryName string  `json:"category_name"`
	Total        float64 `json:"total"`
}

type RevenueBlock struct {
	Items []MethodRevenue `json:"items"`
	Total float64         `json:"total"`
}

type ExpenseBlock struct {
	Items []ExpenseByCategory `json:"items"`
	Total float64             `json:"total"`
}

type MonthlyFinancialSummaryResponse struct {
	BranchID          uint         `json:"branch_id"`
	Year              int          `json:"year"`
	Month             int          `json:"month"`
	Revenue           RevenueBlock `json:"revenue"`
	CenterProductCost float64      `json:"center_product_cost"`
	OtherExpenses     ExpenseBlock `json:"other_expenses"`
	TotalExpenses     float64      `json:"total_expenses"`
	NetProfit         float64      `json:"net_profit"`
}

// -----------------------------------
// Yardımcı: branch_id’yi çöz
// -----------------------------------

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

// -----------------------------------
// GET /api/financial-summary/monthly
// ?year=2025&month=12[&branch_id=1]
// -----------------------------------
func MonthlyFinancialSummaryHandler() fiber.Handler {
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

		// ---------------------------
		// 1) Ciro (cash_movements)
		// ---------------------------

		type revRow struct {
			Method string  `gorm:"column:method"`
			Total  float64 `gorm:"column:total"`
		}
		var revRows []revRow

		if err := database.DB.
			Model(&models.CashMovement{}).
			Select("method, SUM(amount) as total").
			Where("branch_id = ? AND date >= ? AND date <= ? AND direction = ?", branchID, firstDay, lastDay, "in").
			Group("method").
			Scan(&revRows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Ciro hesaplanamadı")
		}

		revenueBlock := RevenueBlock{
			Items: make([]MethodRevenue, 0, len(revRows)),
			Total: 0,
		}

		for _, r := range revRows {
			item := MethodRevenue{
				Method: models.CashMethod(r.Method),
				Total:  r.Total,
			}
			revenueBlock.Items = append(revenueBlock.Items, item)
			revenueBlock.Total += r.Total
		}

		// ---------------------------
		// 2) Merkez ürün maliyeti
		//    (CenterShipment.total_price toplamı)
		// ---------------------------

		var centerCost float64
		if err := database.DB.
			Model(&models.CenterShipment{}).
			Select("COALESCE(SUM(total_price), 0)").
			Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Scan(&centerCost).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Merkez ürün maliyeti hesaplanamadı")
		}

		// ---------------------------
		// 3) Diğer giderler
		//    (Expense.amount toplamları kategori bazlı)
		// ---------------------------

		type expRow struct {
			CategoryID uint    `gorm:"column:category_id"`
			Total      float64 `gorm:"column:total"`
		}
		var expRows []expRow

		if err := database.DB.
			Model(&models.Expense{}).
			Select("category_id, SUM(amount) as total").
			Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Group("category_id").
			Scan(&expRows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Giderler hesaplanamadı")
		}

		// Kategori adlarını getir
		catIDs := make([]uint, 0, len(expRows))
		for _, r := range expRows {
			catIDs = append(catIDs, r.CategoryID)
		}

		catMap := make(map[uint]string)
		if len(catIDs) > 0 {
			var cats []models.ExpenseCategory
			if err := database.DB.Where("id IN ?", catIDs).Find(&cats).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Kategori bilgileri alınamadı")
			}
			for _, ccat := range cats {
				catMap[ccat.ID] = ccat.Name
			}
		}

		otherBlock := ExpenseBlock{
			Items: make([]ExpenseByCategory, 0, len(expRows)),
			Total: 0,
		}

		for _, r := range expRows {
			name := catMap[r.CategoryID]
			otherBlock.Items = append(otherBlock.Items, ExpenseByCategory{
				CategoryID:   r.CategoryID,
				CategoryName: name,
				Total:        r.Total,
			})
			otherBlock.Total += r.Total
		}

		totalExpenses := centerCost + otherBlock.Total
		netProfit := revenueBlock.Total - totalExpenses

		resp := MonthlyFinancialSummaryResponse{
			BranchID:          branchID,
			Year:              year,
			Month:             month,
			Revenue:           revenueBlock,
			CenterProductCost: centerCost,
			OtherExpenses:     otherBlock,
			TotalExpenses:     totalExpenses,
			NetProfit:         netProfit,
		}

		return c.JSON(resp)
	}
}
