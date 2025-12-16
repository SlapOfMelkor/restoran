package models

import "time"

type ProductCategory struct {
	ID        uint      `gorm:"primaryKey"`
	Name      string    `gorm:"size:100;not null;unique"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

