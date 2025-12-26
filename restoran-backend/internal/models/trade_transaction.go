package models

import "time"

// TradeTransaction - Ticari işlem (alacak/verecek)
type TradeTransaction struct {
	ID          uint                   `gorm:"primaryKey"`
	BranchID    uint                   `gorm:"index;not null"`
	Branch      Branch                 `gorm:"foreignKey:BranchID"`
	Type        TradeTransactionType   `gorm:"type:varchar(20);not null;index"` // "receivable" veya "payable"
	Amount      float64                `gorm:"not null"`                        // Toplam tutar
	Description string                 `gorm:"size:500"`                        // Açıklama
	Date        time.Time              `gorm:"index;not null"`                  // İşlem tarihi
	Payments    []TradePayment         `gorm:"foreignKey:TradeTransactionID;constraint:OnDelete:CASCADE"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TradeTransactionType - İşlem tipi
type TradeTransactionType string

const (
	TradeTypeReceivable TradeTransactionType = "receivable" // Alacak
	TradeTypePayable    TradeTransactionType = "payable"    // Verecek
)

// TradePayment - Ticari işleme yapılan ödemeler
type TradePayment struct {
	ID                 uint             `gorm:"primaryKey"`
	BranchID           uint             `gorm:"index;not null"`
	Branch             Branch           `gorm:"foreignKey:BranchID"`
	TradeTransactionID uint             `gorm:"index;not null"`
	TradeTransaction   TradeTransaction `gorm:"foreignKey:TradeTransactionID"`
	Amount             float64          `gorm:"not null"` // Ödeme tutarı
	PaymentDate        time.Time        `gorm:"index;not null"`
	Description        string           `gorm:"size:500"` // Ödeme açıklaması (taksit bilgisi vs.)
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

