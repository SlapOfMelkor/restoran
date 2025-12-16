package admin

import (
	"strings"

	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

type BranchResponse struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Address   string `json:"address"`
	Phone     string `json:"phone"`
	CreatedAt string `json:"created_at"`
}

type CreateBranchRequest struct {
	Name    string  `json:"name"`
	Address string  `json:"address"`
	Phone   *string `json:"phone"` // Opsiyonel
}

type UpdateBranchRequest struct {
	Name    *string `json:"name"`
	Address *string `json:"address"`
	Phone   *string `json:"phone"` // Opsiyonel
}

type CreateBranchAdminRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type BranchAdminResponse struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	BranchID     *uint  `json:"branch_id"`
	PasswordHash string `json:"password_hash"` // Hash'lenmiş şifre (güvenlik için)
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

// ----------------------------------------
// ŞUBE CRUD
// ----------------------------------------

func CreateBranchHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateBranchRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri gönderildi")
		}

		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Şube adı boş olamaz")
		}

		branch := models.Branch{
			Name:    body.Name,
			Address: body.Address,
		}
		if body.Phone != nil {
			branch.Phone = strings.TrimSpace(*body.Phone)
		}

		if err := database.DB.Create(&branch).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Şube oluşturulamadı")
		}

		return c.Status(fiber.StatusCreated).JSON(BranchResponse{
			ID:        branch.ID,
			Name:      branch.Name,
			Address:   branch.Address,
			Phone:     branch.Phone,
			CreatedAt: branch.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

func ListBranchesHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {

		var branches []models.Branch
		if err := database.DB.Find(&branches).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Şubeler listelenemedi")
		}

		res := make([]BranchResponse, 0, len(branches))
		for _, b := range branches {
			res = append(res, BranchResponse{
				ID:        b.ID,
				Name:      b.Name,
				Address:   b.Address,
				Phone:     b.Phone,
				CreatedAt: b.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(res)
	}
}

func GetBranchHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var branch models.Branch
		if err := database.DB.First(&branch, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Şube bulunamadı")
		}

		return c.JSON(BranchResponse{
			ID:        branch.ID,
			Name:      branch.Name,
			Address:   branch.Address,
			Phone:     branch.Phone,
			CreatedAt: branch.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

func UpdateBranchHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Params("id")

		var branch models.Branch
		if err := database.DB.First(&branch, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Şube bulunamadı")
		}

		var body UpdateBranchRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri gönderildi")
		}

		if body.Name != nil {
			name := strings.TrimSpace(*body.Name)
			if name == "" {
				return fiber.NewError(fiber.StatusBadRequest, "Şube adı boş olamaz")
			}
			branch.Name = name
		}

		if body.Address != nil {
			branch.Address = *body.Address
		}

		if body.Phone != nil {
			branch.Phone = strings.TrimSpace(*body.Phone)
		}

		if err := database.DB.Save(&branch).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Şube güncellenemedi")
		}

		return c.JSON(BranchResponse{
			ID:        branch.ID,
			Name:      branch.Name,
			Address:   branch.Address,
			Phone:     branch.Phone,
			CreatedAt: branch.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

func DeleteBranchHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {

		id := c.Params("id")

		if err := database.DB.Delete(&models.Branch{}, "id = ?", id).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Şube silinemedi")
		}

		return c.SendStatus(fiber.StatusNoContent)
	}
}

// ----------------------------------------
// ŞUBE ADMİNİ OLUŞTURMA
// ----------------------------------------

func CreateBranchAdminHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {

		branchID := c.Params("id")

		// Şube kontrolü
		var branch models.Branch
		if err := database.DB.First(&branch, "id = ?", branchID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Şube bulunamadı")
		}

		var body CreateBranchAdminRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz veri gönderildi")
		}

		body.Email = strings.ToLower(strings.TrimSpace(body.Email))
		body.Name = strings.TrimSpace(body.Name)

		if body.Name == "" || body.Email == "" || body.Password == "" {
			return fiber.NewError(fiber.StatusBadRequest, "İsim, email ve şifre zorunlu")
		}

		// Email kontrolü
		var exist models.User
		if err := database.DB.Where("email = ?", body.Email).First(&exist).Error; err == nil {
			return fiber.NewError(fiber.StatusBadRequest, "Bu email zaten kayıtlı")
		}

		hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)

		user := models.User{
			Name:         body.Name,
			Email:        body.Email,
			PasswordHash: string(hash),
			Role:         models.RoleBranchAdmin,
			BranchID:     &branch.ID,
		}

		if err := database.DB.Create(&user).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Şube admini oluşturulamadı")
		}

		// NOT: Şifre sadece oluşturma sırasında bir kez döndürülür (güvenlik)
		// Sonraki isteklerde şifre hash'lenmiş olarak saklanır ve geri dönüştürülemez
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"id":        user.ID,
			"name":      user.Name,
			"email":     user.Email,
			"role":      user.Role,
			"branch_id": user.BranchID,
			"password":  body.Password, // Sadece oluşturma sırasında (bir kez)
		})
	}
}

// ----------------------------------------
// ŞUBE ADMİNLERİNİ LİSTELE
// GET /api/admin/branches/:id/admins
// ----------------------------------------

func ListBranchAdminsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID := c.Params("id")

		var users []models.User
		if err := database.DB.
			Where("branch_id = ? AND role = ?", branchID, models.RoleBranchAdmin).
			Order("created_at DESC").
			Find(&users).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Adminler listelenemedi")
		}

		res := make([]BranchAdminResponse, 0, len(users))
		for _, u := range users {
			res = append(res, BranchAdminResponse{
				ID:           u.ID,
				Name:         u.Name,
				Email:        u.Email,
				Role:         string(u.Role),
				BranchID:     u.BranchID,
				PasswordHash: u.PasswordHash, // Hash'lenmiş şifre
				CreatedAt:    u.CreatedAt.Format("2006-01-02 15:04:05"),
				UpdatedAt:    u.UpdatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(res)
	}
}
