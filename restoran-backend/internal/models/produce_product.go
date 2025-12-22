package models

import "time"

// ProduceProduct - Manav ürünleri için ayrı tablo (Product tablosundan bağımsız)
type ProduceProduct struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"size:100;not null;unique"`
	Unit      string `gorm:"size:20;not null"` // kg, adet, koli vs.
	StockCode string `gorm:"size:50;index"`    // Stok kodu (opsiyonel)
	CreatedAt time.Time
	UpdatedAt time.Time
}

