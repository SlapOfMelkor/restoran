package models

import "time"

type ProductCategory struct {
	ID        uint      `gorm:"primaryKey"`
	BranchID  uint      `gorm:"index;not null"`
	Branch    Branch
	Name      string    `gorm:"size:100;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

