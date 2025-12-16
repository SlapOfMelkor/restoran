package models

import "time"

type Product struct {
	ID              uint   `gorm:"primaryKey"`
	Name            string `gorm:"size:100;not null;unique"`
	Unit            string `gorm:"size:20;not null"` // kg, adet, koli vs.
	IsCenterProduct bool   `gorm:"not null;default:true"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}
