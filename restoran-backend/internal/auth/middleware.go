package auth

import (
	"fmt"
	"strings"

	"restoran-backend/internal/config"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

const (
	CtxUserIDKey   = "user_id"
	CtxUserRoleKey = "user_role"
	CtxBranchIDKey = "branch_id"
)

func JWTMiddleware(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "Authorization header eksik")
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return fiber.NewError(fiber.StatusUnauthorized, "Authorization formatı 'Bearer <token>' olmalı")
		}

		tokenStr := parts[1]

		token, err := jwt.ParseWithClaims(tokenStr, &JWTCustomClaims{}, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("geçersiz imzalama yöntemi")
			}
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			return fiber.NewError(fiber.StatusUnauthorized, "Geçersiz veya süresi dolmuş token")
		}

		claims, ok := token.Claims.(*JWTCustomClaims)
		if !ok {
			return fiber.NewError(fiber.StatusUnauthorized, "Token çözümlenemedi")
		}

		c.Locals(CtxUserIDKey, claims.UserID)
		c.Locals(CtxUserRoleKey, claims.Role)
		c.Locals(CtxBranchIDKey, claims.BranchID)

		return c.Next()
	}
}

func RequireRole(allowedRoles ...models.UserRole) fiber.Handler {
	return func(c *fiber.Ctx) error {
		roleVal := c.Locals(CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if !ok {
			return fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
		}

		for _, r := range allowedRoles {
			if r == role {
				return c.Next()
			}
		}
		return fiber.NewError(fiber.StatusForbidden, "Bu işlem için yetkiniz yok")
	}
}
