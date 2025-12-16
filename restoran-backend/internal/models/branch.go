package models

import "time"

type Branch struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"size:100;not null;unique"`
	Address   string `gorm:"size:255"`
	Phone     string `gorm:"size:50"` // Opsiyonel telefon
	CreatedAt time.Time
	UpdatedAt time.Time

	Users []User
}
