package models

import "time"

// Property - Mal Mülk
type Property struct {
	ID          uint   `gorm:"primaryKey"`
	BranchID    uint   `gorm:"index;not null"`
	Branch      Branch `gorm:"foreignKey:BranchID"`
	Name        string `gorm:"size:200;not null"` // İsim
	Value       float64 `gorm:"not null"`         // Değer
	Description string `gorm:"size:1000"`        // Açıklama
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

