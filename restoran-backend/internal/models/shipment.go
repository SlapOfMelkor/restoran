package models

import "time"

// Shipment: Merkezden gelen sevkiyat (birden fazla ürün içerebilir)
type Shipment struct {
	ID          uint `gorm:"primaryKey"`
	BranchID    uint `gorm:"index;not null"`
	Branch      Branch
	Date        time.Time `gorm:"index;not null"` // sevkiyat tarihi
	TotalAmount float64   `gorm:"not null"`      // toplam maliyet
	IsStocked   bool      `gorm:"default:false"` // stoka kaydedildi mi?
	Note        string    `gorm:"size:255"`       // genel not
	CreatedAt   time.Time
	UpdatedAt   time.Time

	Items []ShipmentItem `gorm:"foreignKey:ShipmentID;constraint:OnDelete:CASCADE"`
}

// ShipmentItem: Sevkiyat içindeki her ürün
type ShipmentItem struct {
	ID               uint `gorm:"primaryKey"`
	ShipmentID       uint `gorm:"index;not null"`
	Shipment         Shipment
	ProductID        uint    `gorm:"index;not null"`
	Product          Product
	Quantity         float64 `gorm:"not null"` // miktar
	UnitPrice        float64 `gorm:"not null"` // KDV'siz birim fiyat
	UnitPriceWithVAT float64 `gorm:"not null"` // KDV'li birim fiyat
	TotalPrice       float64 `gorm:"not null"` // KDV'li toplam maliyet (Quantity * UnitPriceWithVAT)
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

