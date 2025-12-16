package models

import "time"

type ExpenseCategory struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"size:100;unique;not null"`
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
