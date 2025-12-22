package models

import "time"

type ProductCategory struct {
	ID              uint      `gorm:"primaryKey"`
	BranchID        uint      `gorm:"index;not null"`
	Branch          Branch
	Name            string    `gorm:"size:100;not null"`
	IsCenterProduct bool      `gorm:"not null;default:true"` // true = normal ürün kategorisi, false = manav kategorisi
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

