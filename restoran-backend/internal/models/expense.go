package models

import "time"

type ExpenseCategory struct {
	ID        uint   `gorm:"primaryKey"`
	BranchID  uint   `gorm:"index;not null"`
	Branch    Branch
	Name      string `gorm:"size:100;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Expense struct {
	ID          uint `gorm:"primaryKey"`
	BranchID    uint `gorm:"index;not null"`
	Branch      Branch
	CategoryID  uint `gorm:"index;not null"`
	Category    ExpenseCategory
	Date        time.Time `gorm:"index;not null"`
	Amount      float64   `gorm:"not null"`
	Description string    `gorm:"size:255"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// ExpensePayment - Gider kategorisine yapılan ödemeler
type ExpensePayment struct {
	ID          uint      `gorm:"primaryKey"`
	BranchID    uint      `gorm:"index;not null"`
	Branch      Branch
	CategoryID  uint      `gorm:"index;not null"`
	Category    ExpenseCategory
	Amount      float64   `gorm:"not null"` // ödeme tutarı
	Date        time.Time `gorm:"index;not null"`
	Description string    `gorm:"size:255"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}