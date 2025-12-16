package models

import "time"

type StockSnapshotType string

const (
	SnapshotStartOfMonth StockSnapshotType = "start_of_month"
	SnapshotEndOfMonth   StockSnapshotType = "end_of_month"
)

type StockSnapshot struct {
	ID           uint `gorm:"primaryKey"`
	BranchID     uint `gorm:"index;not null"`
	Branch       Branch
	ProductID    uint `gorm:"index;not null"`
	Product      Product
	SnapshotDate time.Time         `gorm:"index;not null"`
	Type         StockSnapshotType `gorm:"size:20;not null"` // start_of_month / end_of_month
	Quantity     float64           `gorm:"not null"`         // o gün eldeki stok
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
