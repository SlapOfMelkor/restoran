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

	// ExpenseCategory migration: BranchID ekleniyor (AutoMigrate'ten ÖNCE)
	// Bu manuel migration, mevcut kayıtları korumak için
	if DB.Migrator().HasTable(&models.ExpenseCategory{}) {
		hasColumn := DB.Migrator().HasColumn(&models.ExpenseCategory{}, "branch_id")
		if !hasColumn {
			log.Println("ExpenseCategory.branch_id kolonu ekleniyor...")
			
			// Önce nullable olarak ekle
			if err := DB.Exec("ALTER TABLE expense_categories ADD COLUMN branch_id BIGINT").Error; err != nil {
				log.Printf("branch_id kolonu eklenirken hata (zaten var olabilir): %v", err)
			} else {
				log.Println("branch_id kolonu nullable olarak eklendi")
			}
			
			// Mevcut kayıtları güncelle
			var categoryCount int64
			DB.Raw("SELECT COUNT(*) FROM expense_categories WHERE branch_id IS NULL").Scan(&categoryCount)
			if categoryCount > 0 {
				var firstBranch models.Branch
				if err := DB.First(&firstBranch).Error; err == nil {
					DB.Exec("UPDATE expense_categories SET branch_id = ? WHERE branch_id IS NULL", firstBranch.ID)
					log.Printf("Mevcut %d ExpenseCategory kaydı branch_id=%d ile güncellendi", categoryCount, firstBranch.ID)
				} else {
					// Şube yoksa kayıtları sil
					DB.Exec("DELETE FROM expense_categories WHERE branch_id IS NULL")
					log.Println("UYARI: Şube bulunamadı, ExpenseCategory kayıtları silindi")
				}
			}
			
			// Şimdi NOT NULL yap
			if err := DB.Exec("ALTER TABLE expense_categories ALTER COLUMN branch_id SET NOT NULL").Error; err != nil {
				log.Printf("branch_id NOT NULL yapılırken hata: %v", err)
			} else {
				log.Println("branch_id NOT NULL yapıldı")
			}
			
			// Index ekle
			DB.Exec("CREATE INDEX IF NOT EXISTS idx_expense_categories_branch_id ON expense_categories(branch_id)")
			log.Println("ExpenseCategory migration tamamlandı")
		}
		
		// Kolon var ama NULL değerler olabilir (migration sırasında oluşmuş olabilir), kontrol et ve güncelle
		var nullCount int64
		DB.Raw("SELECT COUNT(*) FROM expense_categories WHERE branch_id IS NULL").Scan(&nullCount)
		if nullCount > 0 {
			log.Printf("ExpenseCategory tablosunda %d adet NULL branch_id kaydı bulundu, güncelleniyor...", nullCount)
			var firstBranch models.Branch
			if err := DB.First(&firstBranch).Error; err == nil {
				DB.Exec("UPDATE expense_categories SET branch_id = ? WHERE branch_id IS NULL", firstBranch.ID)
				log.Printf("Mevcut %d ExpenseCategory kaydı (NULL branch_id) branch_id=%d ile güncellendi", nullCount, firstBranch.ID)
			} else {
				DB.Exec("DELETE FROM expense_categories WHERE branch_id IS NULL")
				log.Println("UYARI: Şube bulunamadı, NULL branch_id'li ExpenseCategory kayıtları silindi")
			}
			// NOT NULL constraint'i zorla
			if err := DB.Exec("ALTER TABLE expense_categories ALTER COLUMN branch_id SET NOT NULL").Error; err != nil {
				log.Printf("branch_id NOT NULL yapılırken hata (zaten NOT NULL olabilir): %v", err)
			} else {
				log.Println("branch_id NOT NULL yapıldı")
			}
		}
	}

	// ProducePurchase foreign key migration: product_id'yi products'tan produce_products'a yönlendir
	// Eski constraint'i kaldır (AutoMigrate'ten önce)
	if DB.Migrator().HasTable(&models.ProducePurchase{}) {
		log.Println("ProducePurchase foreign key constraint migration kontrol ediliyor...")
		// Eski foreign key constraint'ini kaldır (products tablosunu referans eden)
		if dropErr := DB.Exec("ALTER TABLE produce_purchases DROP CONSTRAINT IF EXISTS fk_produce_purchases_product CASCADE").Error; dropErr != nil {
			log.Printf("Eski constraint kaldırılırken hata (devam ediliyor): %v", dropErr)
		} else {
			log.Println("Eski ProducePurchase foreign key constraint kaldırıldı (varsa)")
		}
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
		&models.ExpensePayment{},
		&models.AuditLog{},
		// Yeni modeller
		&models.Shipment{},
		&models.ShipmentItem{},
		&models.StockEntry{},
		&models.BankAccount{},
		&models.BankTransaction{},
		&models.MonthlyReport{},
		&models.WasteEntry{},
		&models.ProduceProduct{},  // Manav ürünleri (Product tablosundan bağımsız)
		&models.ProducePurchase{},
		&models.ProducePayment{},
		&models.ProduceWaste{},        // Manav zayiat kayıtları
		&models.TradeTransaction{},     // Ticari işlemler (alacak/verecek)
		&models.TradePayment{},         // Ticari ödemeler
		&models.BranchProductOrder{},   // Şube bazlı ürün sıralama
	)
	if err != nil {
		log.Fatalf("AutoMigrate hatası: %v", err)
	}

	// ProducePurchase foreign key constraint'ini manuel olarak düzelt (AutoMigrate bazen constraint'i eklemez)
	if DB.Migrator().HasTable(&models.ProducePurchase{}) && DB.Migrator().HasTable(&models.ProduceProduct{}) {
		// Yeni constraint'in var olup olmadığını kontrol et
		var constraintExists bool
		DB.Raw(`
			SELECT EXISTS (
				SELECT 1 
				FROM information_schema.table_constraints 
				WHERE table_name = 'produce_purchases' 
				AND constraint_name = 'fk_produce_purchases_produce_product'
			)
		`).Scan(&constraintExists)

		if !constraintExists {
			log.Println("ProducePurchase için yeni foreign key constraint ekleniyor (produce_products)...")
			if fkErr := DB.Exec(`
				ALTER TABLE produce_purchases 
				ADD CONSTRAINT fk_produce_purchases_produce_product 
				FOREIGN KEY (product_id) REFERENCES produce_products(id) ON DELETE RESTRICT
			`).Error; fkErr != nil {
				log.Printf("Foreign key constraint eklenirken hata: %v", fkErr)
			} else {
				log.Println("ProducePurchase foreign key constraint başarıyla eklendi")
			}
		} else {
			log.Println("ProducePurchase foreign key constraint zaten mevcut")
		}
	}

	log.Println("Veritabanı bağlantısı başarılı. Migration tamamlandı.")
}
