package models

import "time"

// MonthlyReport: Aylık raporların saklanması
type MonthlyReport struct {
	ID        uint `gorm:"primaryKey"`
	BranchID  uint `gorm:"index;not null"`
	Branch    Branch
	Year      int       `gorm:"index;not null"` // yıl
	Month     int       `gorm:"index;not null"` // ay (1-12)
	ReportDate time.Time `gorm:"index;not null"` // rapor oluşturulma tarihi
	
	// Finansal veriler (JSON olarak saklanabilir veya ayrı tablolar)
	TotalRevenue    float64 `gorm:"default:0"` // toplam ciro
	TotalExpenses   float64 `gorm:"default:0"` // toplam giderler
	TotalShipments  float64 `gorm:"default:0"` // toplam sevkiyat maliyeti
	NetProfit       float64 `gorm:"default:0"` // net kar
	
	// Rapor detayları (JSONB)
	ReportData string `gorm:"type:jsonb"` // detaylı rapor verileri (JSON formatında)
	
	CreatedAt time.Time
	UpdatedAt time.Time
}

