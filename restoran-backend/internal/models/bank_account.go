package models

import "time"

type AccountType string

const (
	AccountTypeBank        AccountType = "bank"         // banka hesabı
	AccountTypeCreditCard  AccountType = "credit_card"  // kredi kartı
)

// BankAccount: Banka hesabı veya kredi kartı
type BankAccount struct {
	ID          uint        `gorm:"primaryKey"`
	BranchID   uint        `gorm:"index;not null"`
	Branch      Branch
	Type        AccountType `gorm:"size:20;not null"` // bank / credit_card
	Name        string      `gorm:"size:100;not null"` // hesap/kart adı (örn: "Ziraat Bankası", "Visa Kredi Kartı")
	AccountNumber string    `gorm:"size:50"`          // hesap numarası (opsiyonel)
	Balance     float64     `gorm:"default:0"`       // bakiye (hesap için pozitif, kredi kartı için borç negatif)
	Description string      `gorm:"size:255"`         // açıklama
	IsActive    bool        `gorm:"default:true"`    // aktif mi?
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

