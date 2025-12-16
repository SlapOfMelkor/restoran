package models

import "time"

type CenterShipment struct {
	ID         uint `gorm:"primaryKey"`
	BranchID   uint `gorm:"index;not null"`
	Branch     Branch
	ProductID  uint `gorm:"index;not null"`
	Product    Product
	Date       time.Time `gorm:"index;not null"`
	Quantity   float64   `gorm:"not null"` // gelen miktar
	UnitPrice  float64   `gorm:"not null"` // birim maliyet
	TotalPrice float64   `gorm:"not null"` // Quantity * UnitPrice
	Note       string    `gorm:"size:255"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
