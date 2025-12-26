package models

// BranchProductOrder: Şube bazlı ürün sıralama bilgisini tutar
// XLSX dosyasından yüklenen sıralama bilgisi burada saklanır
type BranchProductOrder struct {
	ID         uint `gorm:"primaryKey"`
	BranchID   uint `gorm:"index;not null"`
	Branch     Branch
	ProductID  uint `gorm:"index;not null;uniqueIndex:idx_branch_product"` // branch_id + product_id unique
	Product    Product
	OrderIndex int  `gorm:"not null"` // XLSX'teki sıra numarası (0'dan başlar)
}

