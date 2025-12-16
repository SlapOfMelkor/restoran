package admin

import (
	"fmt"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CreateBankAccountRequest struct {
	Type          models.AccountType `json:"type"` // bank / credit_card
	Name          string             `json:"name"`
	AccountNumber string             `json:"account_number"`
	Balance       float64            `json:"balance"`
	Description   string             `json:"description"`
	BranchID      *uint              `json:"branch_id"` // super_admin için
}

type UpdateBankAccountRequest struct {
	Name          *string  `json:"name"`
	AccountNumber *string  `json:"account_number"`
	Balance       *float64 `json:"balance"`
	Description   *string  `json:"description"`
	IsActive      *bool   `json:"is_active"`
}

type BankAccountResponse struct {
	ID            uint                `json:"id"`
	BranchID      uint                `json:"branch_id"`
	Type          models.AccountType  `json:"type"`
	Name          string              `json:"name"`
	AccountNumber string             `json:"account_number"`
	Balance       float64            `json:"balance"`
	Description   string             `json:"description"`
	IsActive      bool               `json:"is_active"`
	CreatedAt     string             `json:"created_at"`
	UpdatedAt     string             `json:"updated_at"`
}

// branch_id çöz (branch_admin -> JWT, super_admin -> body/query)
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

// Yardımcı: Kullanıcı bilgilerini al
func getUserInfo(c *fiber.Ctx) (uint, string, *uint, error) {
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

// POST /api/admin/bank-accounts
func CreateBankAccountHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateBankAccountRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.Type != models.AccountTypeBank && body.Type != models.AccountTypeCreditCard {
			return fiber.NewError(fiber.StatusBadRequest, "type 'bank' veya 'credit_card' olmalı")
		}

		if body.Name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "name zorunlu")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		account := models.BankAccount{
			BranchID:      branchID,
			Type:          body.Type,
			Name:          body.Name,
			AccountNumber: body.AccountNumber,
			Balance:       body.Balance,
			Description:   body.Description,
			IsActive:      true,
		}

		if err := database.DB.Create(&account).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Hesap oluşturulamadı")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &branchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "bank_account",
				EntityID:    account.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Hesap/Kart eklendi: %s - %s", account.Type, account.Name),
				Before:      nil,
				After:       account,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(BankAccountResponse{
			ID:            account.ID,
			BranchID:      account.BranchID,
			Type:          account.Type,
			Name:          account.Name,
			AccountNumber: account.AccountNumber,
			Balance:       account.Balance,
			Description:   account.Description,
			IsActive:      account.IsActive,
			CreatedAt:     account.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:     account.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/admin/bank-accounts
func ListBankAccountsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var accounts []models.BankAccount
		if err := database.DB.
			Where("branch_id = ?", branchID).
			Order("type ASC, name ASC").
			Find(&accounts).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Hesaplar listelenemedi")
		}

		resp := make([]BankAccountResponse, 0, len(accounts))
		for _, acc := range accounts {
			resp = append(resp, BankAccountResponse{
				ID:            acc.ID,
				BranchID:      acc.BranchID,
				Type:          acc.Type,
				Name:          acc.Name,
				AccountNumber: acc.AccountNumber,
				Balance:       acc.Balance,
				Description:   acc.Description,
				IsActive:      acc.IsActive,
				CreatedAt:     acc.CreatedAt.Format("2006-01-02 15:04:05"),
				UpdatedAt:     acc.UpdatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(resp)
	}
}

// PUT /api/admin/bank-accounts/:id
func UpdateBankAccountHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var account models.BankAccount
		if err := database.DB.First(&account, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Hesap bulunamadı")
		}

		var body UpdateBankAccountRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		oldAccount := account

		if body.Name != nil {
			account.Name = *body.Name
		}
		if body.AccountNumber != nil {
			account.AccountNumber = *body.AccountNumber
		}
		if body.Balance != nil {
			account.Balance = *body.Balance
		}
		if body.Description != nil {
			account.Description = *body.Description
		}
		if body.IsActive != nil {
			account.IsActive = *body.IsActive
		}

		if err := database.DB.Save(&account).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Hesap güncellenemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &account.BranchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "bank_account",
				EntityID:    account.ID,
				Action:      models.AuditActionUpdate,
				Description: fmt.Sprintf("Hesap/Kart güncellendi: %s", account.Name),
				Before:      oldAccount,
				After:       account,
			})
		}

		return c.JSON(BankAccountResponse{
			ID:            account.ID,
			BranchID:      account.BranchID,
			Type:          account.Type,
			Name:          account.Name,
			AccountNumber: account.AccountNumber,
			Balance:       account.Balance,
			Description:   account.Description,
			IsActive:      account.IsActive,
			CreatedAt:     account.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:     account.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// DELETE /api/admin/bank-accounts/:id
func DeleteBankAccountHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var account models.BankAccount
		if err := database.DB.First(&account, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Hesap bulunamadı")
		}

		// İşlem kayıtları var mı kontrol et
		var count int64
		database.DB.Model(&models.BankTransaction{}).Where("bank_account_id = ?", id).Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Bu hesaba ait işlemler var, önce işlemleri silin")
		}

		if err := database.DB.Delete(&account).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Hesap silinemedi")
		}

		// Audit log
		userID, userName, _, err := getUserInfo(c)
		if err == nil {
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    &account.BranchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "bank_account",
				EntityID:    account.ID,
				Action:      models.AuditActionDelete,
				Description: fmt.Sprintf("Hesap/Kart silindi: %s", account.Name),
				Before:      account,
				After:       nil,
			})
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

