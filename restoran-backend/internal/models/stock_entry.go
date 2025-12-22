package models

import "time"

// StockEntry: Stok sayımı kaydı (ay başı/sonu ayrımı yok, sadece o anki durum)
type StockEntry struct {
	ID        uint `gorm:"primaryKey"`
	BranchID  uint `gorm:"index;not null"`
	Branch    Branch
	ProductID uint    `gorm:"index;not null"`
	Product   Product
	Date      time.Time `gorm:"index;not null"` // sayım tarihi
	Quantity  float64   `gorm:"not null"`      // o anki stok miktarı
	Note      string    `gorm:"size:255"`      // Opsiyonel not (ör: "Sevkiyat #123")
	CreatedAt time.Time
	UpdatedAt time.Time
}

