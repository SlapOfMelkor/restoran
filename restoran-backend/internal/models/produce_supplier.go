package models

import "time"

// ProduceSupplier - Manav tedarikçi
type ProduceSupplier struct {
	ID          uint   `gorm:"primaryKey"`
	BranchID    uint   `gorm:"index;not null"`
	Branch      Branch `gorm:"foreignKey:BranchID"`
	Name        string `gorm:"size:200;not null"`
	Description string `gorm:"size:500"` // Açıklama (opsiyonel)
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

