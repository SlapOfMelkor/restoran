package models

import "time"

// WasteEntry: Ürün zayiatı kaydı (günlük)
type WasteEntry struct {
	ID        uint `gorm:"primaryKey"`
	BranchID  uint `gorm:"index;not null"`
	Branch    Branch
	ProductID uint    `gorm:"index;not null"`
	Product   Product
	Date      time.Time `gorm:"index;not null"` // zayiat tarihi
	Quantity  float64   `gorm:"not null"`      // zayiat miktarı
	Note      string    `gorm:"size:500;not null"` // zorunlu: hangi garson/mutfakçı sebep oldu
	CreatedAt time.Time
	UpdatedAt time.Time
}

