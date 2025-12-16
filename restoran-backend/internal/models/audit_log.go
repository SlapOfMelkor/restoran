package models

import "time"

type AuditAction string

const (
	AuditActionCreate AuditAction = "create"
	AuditActionUpdate AuditAction = "update"
	AuditActionDelete AuditAction = "delete"
	AuditActionUndo   AuditAction = "undo"
)

type AuditLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	// Hangi şube?
	BranchID *uint `json:"branch_id"`

	// Hangi kullanıcı?
	UserID   uint   `json:"user_id"`
	UserName string `gorm:"size:100" json:"user_name"` // Kullanıcı adı (denormalize)

	// Hangi entity? (ör: "expense", "cash_movement", "center_shipment", "stock_snapshot")
	EntityType string `gorm:"size:50;index" json:"entity_type"`
	EntityID   uint   `gorm:"index" json:"entity_id"`

	// İşlem tipi: create/update/delete/undo
	Action AuditAction `gorm:"size:20" json:"action"`

	// Opsiyonel açıklama (küçük bir özet)
	Description string `gorm:"size:255" json:"description"`

	// Önceki ve sonraki hal (JSON)
	BeforeData string `gorm:"type:jsonb" json:"before_data"`
	AfterData  string `gorm:"type:jsonb" json:"after_data"`

	// Bu log bir undo işlemi sonucunda mı oluştu
	Undone bool `json:"undone"`

	// Undo edildi mi? (eğer bu log undo edildiyse true)
	IsUndone bool `gorm:"default:false" json:"is_undone"`

	// Undo eden kullanıcı (eğer undo edildiyse)
	UndoneBy   *uint   `json:"undone_by"`
	UndoneAt   *time.Time `json:"undone_at"`
}

