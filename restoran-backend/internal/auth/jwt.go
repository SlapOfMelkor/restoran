package auth

import (
	"time"

	"restoran-backend/internal/models"

	"github.com/golang-jwt/jwt/v5"
)

type JWTCustomClaims struct {
	UserID   uint            `json:"user_id"`
	Email    string          `json:"email"`
	Role     models.UserRole `json:"role"`
	BranchID *uint           `json:"branch_id"`
	jwt.RegisteredClaims
}

func GenerateToken(secret string, user *models.User) (string, error) {
	claims := &JWTCustomClaims{
		UserID:   user.ID,
		Email:    user.Email,
		Role:     user.Role,
		BranchID: user.BranchID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)), // 1 gün
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
