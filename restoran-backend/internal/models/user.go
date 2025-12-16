package models

import "time"

type UserRole string

const (
	RoleSuperAdmin  UserRole = "super_admin"
	RoleBranchAdmin UserRole = "branch_admin"
)

type User struct {
	ID           uint `gorm:"primaryKey"`
	BranchID     *uint
	Branch       *Branch
	Name         string   `gorm:"size:100;not null"`
	Email        string   `gorm:"size:100;uniqueIndex;not null"`
	PasswordHash string   `gorm:"size:255;not null"`
	Role         UserRole `gorm:"size:20;not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
