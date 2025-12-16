package expense

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

type ExpenseCategoryResponse struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

type CreateExpenseCategoryRequest struct {
	Name string `json:"name"`
}

type UpdateExpenseCategoryRequest struct {
	Name *string `json:"name"`
}

type CreateExpenseRequest struct {
	Date        string  `json:"date"` // "2025-12-09"
	CategoryID  uint    `json:"category_id"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	BranchID    *uint   `json:"branch_id"` // super_admin için opsiyonel
}

type ExpenseResponse struct {
	ID          uint    `json:"id"`
	BranchID    uint    `json:"branch_id"`
	CategoryID  uint    `json:"category_id"`
	Category    string  `json:"category"`
	Date        string  `json:"date"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
}

type MonthlyExpenseSummaryItem struct {
	CategoryID   uint    `json:"category_id"`
	CategoryName string  `json:"category_name"`
	Total        float64 `json:"total"`
}

type MonthlyExpenseSummaryResponse struct {
	BranchID   uint                        `json:"branch_id"`
	Year       int                         `json:"year"`
	Month      int                         `json:"month"`
	Items      []MonthlyExpenseSummaryItem `json:"items"`
	GrandTotal float64                     `json:"grand_total"`
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
// Expense Category CRUD
// -------------------------

// GET /api/expense-categories  (auth olan herkes)
func ListExpenseCategoriesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var cats []models.ExpenseCategory
		if err := database.DB.Order("name asc").Find(&cats).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategoriler listelenemedi")
		}

		res := make([]ExpenseCategoryResponse, 0, len(cats))
		for _, cat := range cats {
			res = append(res, ExpenseCategoryResponse{
				ID:   cat.ID,
				Name: cat.Name,
			})
		}
		return c.JSON(res)
	}
}

// POST /api/admin/expense-categories (super_admin)
func CreateExpenseCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateExpenseCategoryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Name zorunlu")
		}

		cat := models.ExpenseCategory{Name: body.Name}
		if err := database.DB.Create(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori oluşturulamadı")
		}

		return c.Status(fiber.StatusCreated).JSON(ExpenseCategoryResponse{
			ID:   cat.ID,
			Name: cat.Name,
		})
	}
}

// PUT /api/admin/expense-categories/:id
func UpdateExpenseCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var cat models.ExpenseCategory
		if err := database.DB.First(&cat, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Kategori bulunamadı")
		}

		var body UpdateExpenseCategoryRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri")
		}

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Name boş olamaz")
			}
			cat.Name = name
		}

		if err := database.DB.Save(&cat).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori güncellenemedi")
		}

		return c.JSON(ExpenseCategoryResponse{
			ID:   cat.ID,
			Name: cat.Name,
		})
	}
}

// DELETE /api/admin/expense-categories/:id
func DeleteExpenseCategoryHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		if err := database.DB.Delete(&models.ExpenseCategory{}, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kategori silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

// -------------------------
// Expense CRUD
// -------------------------

// POST /api/expenses
func CreateExpenseHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateExpenseRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.CategoryID == 0 || body.Amount <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "category_id ve amount zorunlu, amount > 0 olmalı")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// Kategori var mı?
		var cat models.ExpenseCategory
		if err := database.DB.First(&cat, "id = ?", body.CategoryID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Kategori bulunamadı")
		}

		exp := models.Expense{
			BranchID:    branchID,
			CategoryID:  body.CategoryID,
			Date:        d,
			Amount:      body.Amount,
			Description: body.Description,
		}

		if err := database.DB.Create(&exp).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Gider kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			// Branch ilişkisini exclude et (JSON hatası önlemek için)
			afterData := map[string]interface{}{
				"id":          exp.ID,
				"branch_id":   exp.BranchID,
				"category_id": exp.CategoryID,
				"date":        exp.Date.Format("2006-01-02"),
				"amount":      exp.Amount,
				"description": exp.Description,
			}
			// exp.BranchID'yi kullan (super admin için getUserInfo null dönebilir)
			branchIDForLog := &exp.BranchID
			if logErr := audit.WriteLog(audit.LogOptions{
				BranchID:    branchIDForLog,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "expense",
				EntityID:    exp.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Gider eklendi: %s - %.2f TL", cat.Name, exp.Amount),
				Before:      nil,
				After:       afterData,
			}); logErr != nil {
				// Log hatası kritik değil, sadece log'la
				fmt.Printf("Audit log yazılamadı: %v\n", logErr)
			}
		}

		return c.Status(fiber.StatusCreated).JSON(ExpenseResponse{
			ID:          exp.ID,
			BranchID:    exp.BranchID,
			CategoryID:  exp.CategoryID,
			Category:    cat.Name,
			Date:        exp.Date.Format("2006-01-02"),
			Amount:      exp.Amount,
			Description: exp.Description,
		})
	}
}

// GET /api/expenses?from=...&to=...&category_id=...&branch_id=...
func ListExpensesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		fromStr := c.Query("from")
		toStr := c.Query("to")
		catStr := c.Query("category_id")

		dbq := database.DB.Model(&models.Expense{}).
			Preload("Category").
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

		if catStr != "" {
			var cid uint
			if _, err := fmt.Sscan(catStr, &cid); err != nil || cid == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "category_id geçersiz")
			}
			dbq = dbq.Where("category_id = ?", cid)
		}

		var rows []models.Expense
		if err := dbq.Order("date asc, id asc").Find(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Giderler listelenemedi")
		}

		resp := make([]ExpenseResponse, 0, len(rows))
		for _, r := range rows {
			resp = append(resp, ExpenseResponse{
				ID:          r.ID,
				BranchID:    r.BranchID,
				CategoryID:  r.CategoryID,
				Category:    r.Category.Name,
				Date:        r.Date.Format("2006-01-02"),
				Amount:      r.Amount,
				Description: r.Description,
			})
		}

		return c.JSON(resp)
	}
}

// -------------------------
// Aylık gider özeti
// GET /api/expenses/summary/monthly?year=2025&month=12[&branch_id=1]
// -------------------------
func MonthlyExpenseSummaryHandler() fiber.Handler {
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
			CategoryID uint    `gorm:"column:category_id"`
			Total      float64 `gorm:"column:total"`
		}
		var rows []row

		if err := database.DB.
			Model(&models.Expense{}).
			Select("category_id, SUM(amount) as total").
			Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Group("category_id").
			Scan(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Özet hesaplanamadı")
		}

		// kategori isimlerini çek
		ids := make([]uint, 0, len(rows))
		for _, r := range rows {
			ids = append(ids, r.CategoryID)
		}

		var cats []models.ExpenseCategory
		if len(ids) > 0 {
			if err := database.DB.Where("id IN ?", ids).Find(&cats).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Kategoriler yüklenemedi")
			}
		}

		catMap := make(map[uint]string)
		for _, ccat := range cats {
			catMap[ccat.ID] = ccat.Name
		}

		resp := MonthlyExpenseSummaryResponse{
			BranchID:   branchID,
			Year:       year,
			Month:      month,
			Items:      make([]MonthlyExpenseSummaryItem, 0, len(rows)),
			GrandTotal: 0,
		}

		for _, r := range rows {
			name := catMap[r.CategoryID]
			item := MonthlyExpenseSummaryItem{
				CategoryID:   r.CategoryID,
				CategoryName: name,
				Total:        r.Total,
			}
			resp.Items = append(resp.Items, item)
			resp.GrandTotal += r.Total
		}

		return c.JSON(resp)
	}
}
