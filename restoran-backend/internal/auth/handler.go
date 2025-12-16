package auth

import (
	"strings"

	"restoran-backend/internal/config"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

type RegisterSuperAdminRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func RegisterSuperAdminHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body RegisterSuperAdminRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		body.Email = strings.TrimSpace(strings.ToLower(body.Email))

		if body.Email == "" || body.Password == "" || body.Name == "" {
			return fiber.NewError(fiber.StatusBadRequest, "İsim, email ve şifre zorunlu")
		}

		// Zaten super admin varsa ikinciyi engellemek isteyebilirsin
		var count int64
		database.DB.Model(&models.User{}).
			Where("role = ?", models.RoleSuperAdmin).
			Count(&count)
		if count > 0 {
			return fiber.NewError(fiber.StatusForbidden, "Zaten bir super admin var")
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Şifre hashlenemedi")
		}

		user := models.User{
			Name:         body.Name,
			Email:        body.Email,
			PasswordHash: string(hash),
			Role:         models.RoleSuperAdmin,
		}

		if err := database.DB.Create(&user).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kullanıcı oluşturulamadı")
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"id":    user.ID,
			"email": user.Email,
			"role":  user.Role,
		})
	}
}

func LoginHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body LoginRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		body.Email = strings.TrimSpace(strings.ToLower(body.Email))

		var user models.User
		if err := database.DB.Where("email = ?", body.Email).First(&user).Error; err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Email veya şifre hatalı")
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "Email veya şifre hatalı")
		}

		token, err := GenerateToken(cfg.JWTSecret, &user)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Token oluşturulamadı")
		}

		return c.JSON(fiber.Map{
			"token": token,
			"user": fiber.Map{
				"id":        user.ID,
				"name":      user.Name,
				"email":     user.Email,
				"role":      user.Role,
				"branch_id": user.BranchID,
			},
		})
	}
}

func MeHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		userIDVal := c.Locals(CtxUserIDKey)
		roleVal := c.Locals(CtxUserRoleKey)
		branchIDVal := c.Locals(CtxBranchIDKey)

		// Kullanıcı bilgilerini veritabanından çek
		var user models.User
		if userID, ok := userIDVal.(uint); ok {
			if err := database.DB.First(&user, userID).Error; err == nil {
				response := fiber.Map{
					"user_id": user.ID,
					"name":    user.Name,
					"email":   user.Email,
					"role":    user.Role,
					"branch_id": user.BranchID,
				}

				// Branch admin ise branch bilgisini de ekle
				if user.BranchID != nil {
					var branch models.Branch
					if err := database.DB.First(&branch, *user.BranchID).Error; err == nil {
						response["branch"] = fiber.Map{
							"id":      branch.ID,
							"name":    branch.Name,
							"address": branch.Address,
							"phone":   branch.Phone,
						}
					}
				}

				return c.JSON(response)
			}
		}

		// Fallback: Eğer veritabanından çekilemezse locals'dan döndür
		return c.JSON(fiber.Map{
			"user_id":   userIDVal,
			"role":      roleVal,
			"branch_id": branchIDVal,
		})
	}
}
