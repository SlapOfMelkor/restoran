package models

import "time"

type TransactionType string

const (
	TransactionTypeDeposit  TransactionType = "deposit"  // para yatırma
	TransactionTypeWithdraw TransactionType = "withdraw" // para çekme
	TransactionTypePayment  TransactionType = "payment"  // ödeme (kredi kartı için)
)

// BankTransaction: Banka hesabı/kart işlemleri
type BankTransaction struct {
	ID            uint            `gorm:"primaryKey"`
	BankAccountID uint           `gorm:"index;not null"`
	BankAccount   BankAccount
	Type          TransactionType `gorm:"size:20;not null"` // deposit / withdraw / payment
	Amount        float64         `gorm:"not null"`         // işlem tutarı
	Date          time.Time       `gorm:"index;not null"`    // işlem tarihi
	Description   string          `gorm:"size:255"`         // açıklama
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

