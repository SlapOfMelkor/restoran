package database

import (
	"log"

	"restoran-backend/internal/config"
	"restoran-backend/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init(cfg *config.Config) {
	var err error

	DB, err = gorm.Open(postgres.Open(cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("Veritabanına bağlanılamadı: %v", err)
	}

	err = DB.AutoMigrate(
		&models.Branch{},
		&models.User{},
		&models.CashMovement{},
		&models.Product{},
		&models.CenterShipment{}, // Eski model (geriye dönük uyumluluk için)
		&models.StockSnapshot{},  // Eski model (geriye dönük uyumluluk için)
		&models.ExpenseCategory{},
		&models.Expense{},
		&models.AuditLog{},
		// Yeni modeller
		&models.Shipment{},
		&models.ShipmentItem{},
		&models.StockEntry{},
		&models.BankAccount{},
		&models.BankTransaction{},
		&models.MonthlyReport{},
		&models.WasteEntry{},
	)
	if err != nil {
		log.Fatalf("AutoMigrate hatası: %v", err)
	}

	log.Println("Veritabanı bağlantısı başarılı. Migration tamamlandı.")
}
