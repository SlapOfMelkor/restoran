package models

import "time"

// ProduceWaste - Manav ürünleri için zayiat kayıtları
type ProduceWaste struct {
	ID          uint    `gorm:"primaryKey"`
	BranchID    uint    `gorm:"index;not null"`
	Branch      Branch  `gorm:"foreignKey:BranchID"`
	SupplierID  uint    `gorm:"index;not null"` // ProduceSupplier ID
	Supplier    ProduceSupplier `gorm:"foreignKey:SupplierID"`
	ProductID   uint    `gorm:"index;not null"` // ProduceProduct ID
	Product     ProduceProduct `gorm:"foreignKey:ProductID"`
	PurchaseID  *uint     `gorm:"index"` // Hangi alım kaydından zayiat (opsiyonel)
	Quantity    float64   `gorm:"not null"` // zayiat miktarı
	Date        time.Time `gorm:"index;not null"`
	Description string    `gorm:"size:255"` // Açıklama (örn: "çürük çıktı", "bozuldu")
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

