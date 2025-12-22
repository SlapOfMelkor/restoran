package models

import "time"

// ProducePurchase - Manavdan alınan ürün kayıtları
type ProducePurchase struct {
	ID          uint    `gorm:"primaryKey"`
	BranchID    uint    `gorm:"index;not null"`
	Branch      Branch  `gorm:"foreignKey:BranchID"`
	ProductID   uint    `gorm:"index;not null"` // ProduceProduct ID
	Product     ProduceProduct `gorm:"foreignKey:ProductID"`
	Quantity    float64 `gorm:"not null"` // miktar (kg, adet vs.)
	UnitPrice   float64 `gorm:"not null"` // birim fiyat
	TotalAmount float64 `gorm:"not null"` // toplam tutar (quantity * unit_price)
	Date        time.Time `gorm:"index;not null"`
	Description string    `gorm:"size:255"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// ProducePayment - Manava yapılan ödemeler
type ProducePayment struct {
	ID          uint      `gorm:"primaryKey"`
	BranchID    uint      `gorm:"index;not null"`
	Branch      Branch
	Amount      float64   `gorm:"not null"` // ödeme tutarı
	Date        time.Time `gorm:"index;not null"`
	Description string    `gorm:"size:255"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

