package audit

import (
	"encoding/json"
	"fmt"
	"time"

	"restoran-backend/internal/database"
	"restoran-backend/internal/models"
)

type LogOptions struct {
	BranchID    *uint
	UserID      uint
	UserName    string
	EntityType  string
	EntityID    uint
	Action      models.AuditAction
	Description string
	Before      any
	After       any
}

func WriteLog(opts LogOptions) error {
	// PostgreSQL jsonb için boş string yerine "null" JSON string'i kullanmalıyız
	beforeStr := "null" // Default: null JSON
	afterStr := "null"  // Default: null JSON

	if opts.Before != nil {
		if b, err := json.Marshal(opts.Before); err == nil {
			beforeStr = string(b)
		}
	}
	if opts.After != nil {
		if b, err := json.Marshal(opts.After); err == nil {
			afterStr = string(b)
		}
	}

	log := models.AuditLog{
		BranchID:    opts.BranchID,
		UserID:      opts.UserID,
		UserName:    opts.UserName,
		EntityType:  opts.EntityType,
		EntityID:    opts.EntityID,
		Action:      opts.Action,
		Description: opts.Description,
		BeforeData:  beforeStr,
		AfterData:   afterStr,
		Undone:      false,
		IsUndone:    false,
	}

	if err := database.DB.Create(&log).Error; err != nil {
		return fmt.Errorf("audit log kaydedilemedi: %w", err)
	}

	return nil
}

// UndoLog - Bir audit log'u undo et
func UndoLog(logID uint, userID uint, userName string) error {
	var log models.AuditLog
	if err := database.DB.First(&log, "id = ?", logID).Error; err != nil {
		return fmt.Errorf("log bulunamadı: %w", err)
	}

	// Zaten undo edilmiş mi?
	if log.IsUndone {
		return fmt.Errorf("bu işlem zaten geri alınmış")
	}

	// Undo işlemini gerçekleştir
	switch log.Action {
	case models.AuditActionCreate:
		// Create ise entity'yi sil
		if err := deleteEntity(log.EntityType, log.EntityID); err != nil {
			return fmt.Errorf("entity silinemedi: %w", err)
		}

	case models.AuditActionUpdate:
		// Update ise önceki haline geri döndür
		if err := restoreEntity(log.EntityType, log.EntityID, log.BeforeData); err != nil {
			return fmt.Errorf("entity geri yüklenemedi: %w", err)
		}

	case models.AuditActionDelete:
		// Delete ise entity'yi geri oluştur (create)
		if err := recreateEntity(log.EntityType, log.AfterData); err != nil {
			return fmt.Errorf("entity geri oluşturulamadı: %w", err)
		}

	default:
		return fmt.Errorf("bu işlem türü geri alınamaz")
	}

	// Log'u işaretle
	now := time.Now()
	log.IsUndone = true
	log.UndoneBy = &userID
	log.UndoneAt = &now

	if err := database.DB.Save(&log).Error; err != nil {
		return fmt.Errorf("log güncellenemedi: %w", err)
	}

	// Undo işlemi için yeni bir log oluştur
	undoLog := models.AuditLog{
		BranchID:    log.BranchID,
		UserID:      userID,
		UserName:    userName,
		EntityType:  log.EntityType,
		EntityID:    log.EntityID,
		Action:      models.AuditActionUndo,
		Description: fmt.Sprintf("Geri alındı: %s", log.Description),
		BeforeData:  log.AfterData,
		AfterData:   log.BeforeData,
		Undone:      true,
		IsUndone:    false,
	}

	if err := database.DB.Create(&undoLog).Error; err != nil {
		return fmt.Errorf("undo log kaydedilemedi: %w", err)
	}

	return nil
}

// deleteEntity - Entity'yi sil
func deleteEntity(entityType string, entityID uint) error {
	switch entityType {
	case "expense":
		return database.DB.Delete(&models.Expense{}, "id = ?", entityID).Error
	case "cash_movement":
		return database.DB.Delete(&models.CashMovement{}, "id = ?", entityID).Error
	case "center_shipment":
		return database.DB.Delete(&models.CenterShipment{}, "id = ?", entityID).Error
	case "stock_snapshot":
		return database.DB.Delete(&models.StockSnapshot{}, "id = ?", entityID).Error
	case "stock_entry":
		return database.DB.Delete(&models.StockEntry{}, "id = ?", entityID).Error
	case "shipment":
		return database.DB.Delete(&models.Shipment{}, "id = ?", entityID).Error
	case "waste_entry":
		return database.DB.Delete(&models.WasteEntry{}, "id = ?", entityID).Error
	default:
		return fmt.Errorf("bilinmeyen entity tipi: %s", entityType)
	}
}

// recreateEntity - Silinen entity'yi geri oluştur
func recreateEntity(entityType string, dataJSON string) error {
	switch entityType {
	case "expense":
		var expense models.Expense
		if err := json.Unmarshal([]byte(dataJSON), &expense); err != nil {
			return err
		}
		expense.ID = 0 // Yeni entity oluştur
		return database.DB.Create(&expense).Error

	case "cash_movement":
		var movement models.CashMovement
		if err := json.Unmarshal([]byte(dataJSON), &movement); err != nil {
			return err
		}
		movement.ID = 0
		return database.DB.Create(&movement).Error

	case "center_shipment":
		var shipment models.CenterShipment
		if err := json.Unmarshal([]byte(dataJSON), &shipment); err != nil {
			return err
		}
		shipment.ID = 0
		return database.DB.Create(&shipment).Error

	case "stock_snapshot":
		var snapshot models.StockSnapshot
		if err := json.Unmarshal([]byte(dataJSON), &snapshot); err != nil {
			return err
		}
		snapshot.ID = 0
		return database.DB.Create(&snapshot).Error

	case "stock_entry":
		var entry models.StockEntry
		if err := json.Unmarshal([]byte(dataJSON), &entry); err != nil {
			return err
		}
		entry.ID = 0
		return database.DB.Create(&entry).Error

	case "shipment":
		var shipment models.Shipment
		if err := json.Unmarshal([]byte(dataJSON), &shipment); err != nil {
			return err
		}
		shipment.ID = 0
		// ShipmentItem'ları da geri oluştur
		if err := database.DB.Create(&shipment).Error; err != nil {
			return err
		}
		// Items'ı ayrı ayrı oluştur (JSON'dan gelen veri ile)
		// Not: Bu durumda AfterData'da shipment ile birlikte items da olmalı
		// Şimdilik sadece shipment'ı oluşturuyoruz
		return nil

	case "waste_entry":
		var entry models.WasteEntry
		if err := json.Unmarshal([]byte(dataJSON), &entry); err != nil {
			return err
		}
		entry.ID = 0
		return database.DB.Create(&entry).Error

	default:
		return fmt.Errorf("bilinmeyen entity tipi: %s", entityType)
	}
}

// restoreEntity - Entity'yi geri yükle (update)
func restoreEntity(entityType string, entityID uint, dataJSON string) error {
	switch entityType {
	case "expense":
		var expense models.Expense
		if err := json.Unmarshal([]byte(dataJSON), &expense); err != nil {
			return err
		}
		// ID'yi set et ve update et
		expense.ID = entityID
		return database.DB.Model(&models.Expense{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":   expense.BranchID,
			"category_id": expense.CategoryID,
			"date":        expense.Date,
			"amount":      expense.Amount,
			"description": expense.Description,
		}).Error

	case "cash_movement":
		var movement models.CashMovement
		if err := json.Unmarshal([]byte(dataJSON), &movement); err != nil {
			return err
		}
		movement.ID = entityID
		return database.DB.Model(&models.CashMovement{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":    movement.BranchID,
			"date":         movement.Date,
			"method":       movement.Method,
			"direction":    movement.Direction,
			"amount":       movement.Amount,
			"description":   movement.Description,
		}).Error

	case "center_shipment":
		var shipment models.CenterShipment
		if err := json.Unmarshal([]byte(dataJSON), &shipment); err != nil {
			return err
		}
		shipment.ID = entityID
		return database.DB.Model(&models.CenterShipment{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":   shipment.BranchID,
			"product_id":  shipment.ProductID,
			"date":        shipment.Date,
			"quantity":    shipment.Quantity,
			"unit_price":  shipment.UnitPrice,
			"total_price": shipment.TotalPrice,
			"note":        shipment.Note,
		}).Error

	case "stock_snapshot":
		var snapshot models.StockSnapshot
		if err := json.Unmarshal([]byte(dataJSON), &snapshot); err != nil {
			return err
		}
		snapshot.ID = entityID
		return database.DB.Model(&models.StockSnapshot{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":     snapshot.BranchID,
			"product_id":    snapshot.ProductID,
			"snapshot_date": snapshot.SnapshotDate,
			"type":          snapshot.Type,
			"quantity":      snapshot.Quantity,
		}).Error

	case "stock_entry":
		var entry models.StockEntry
		if err := json.Unmarshal([]byte(dataJSON), &entry); err != nil {
			return err
		}
		entry.ID = entityID
		return database.DB.Model(&models.StockEntry{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":  entry.BranchID,
			"product_id": entry.ProductID,
			"date":       entry.Date,
			"quantity":   entry.Quantity,
		}).Error

	case "waste_entry":
		var entry models.WasteEntry
		if err := json.Unmarshal([]byte(dataJSON), &entry); err != nil {
			return err
		}
		entry.ID = entityID
		return database.DB.Model(&models.WasteEntry{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":  entry.BranchID,
			"product_id": entry.ProductID,
			"date":       entry.Date,
			"quantity":   entry.Quantity,
			"note":       entry.Note,
		}).Error

	case "shipment":
		var shipment models.Shipment
		if err := json.Unmarshal([]byte(dataJSON), &shipment); err != nil {
			return err
		}
		shipment.ID = entityID
		return database.DB.Model(&models.Shipment{}).Where("id = ?", entityID).Updates(map[string]interface{}{
			"branch_id":  shipment.BranchID,
			"date":       shipment.Date,
			"note":       shipment.Note,
			"is_stocked": shipment.IsStocked,
		}).Error

	default:
		return fmt.Errorf("bilinmeyen entity tipi: %s", entityType)
	}
}

