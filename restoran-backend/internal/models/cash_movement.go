package models

import "time"

type CashMethod string

const (
	CashMethodCash        CashMethod = "cash"        // nakit
	CashMethodPOS         CashMethod = "pos"         // pos
	CashMethodYemekSepeti CashMethod = "yemeksepeti" // yemek sepeti
)

type CashMovement struct {
	ID          uint `gorm:"primaryKey"`
	BranchID    uint `gorm:"index;not null"`
	Branch      Branch
	Date        time.Time  `gorm:"index;not null"`   // gün bazlı
	Method      CashMethod `gorm:"size:20;not null"` // cash / pos / yemeksepeti
	Direction   string     `gorm:"size:10;not null"` // "in" / "out" (şimdilik hep "in")
	Amount      float64    `gorm:"not null"`         // tutar
	Description string     `gorm:"size:255"`         // opsiyonel açıklama
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
