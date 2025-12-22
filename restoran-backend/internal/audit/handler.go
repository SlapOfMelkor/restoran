package audit

import (
	"fmt"

	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type AuditLogResponse struct {
	ID          uint              `json:"id"`
	CreatedAt   string            `json:"created_at"`
	BranchID    *uint             `json:"branch_id"`
	UserID      uint              `json:"user_id"`
	UserName    string            `json:"user_name"`
	EntityType  string            `json:"entity_type"`
	EntityID    uint              `json:"entity_id"`
	Action      models.AuditAction `json:"action"`
	Description string            `json:"description"`
	IsUndone    bool              `json:"is_undone"`
	UndoneBy    *uint             `json:"undone_by"`
	UndoneAt    *string           `json:"undone_at"`
}

// GET /api/audit-logs?entity_type=expense&entity_id=1&branch_id=1
func ListAuditLogsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if !ok {
			return fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
		}

		// Branch ID çöz
		var branchID *uint
		if role == models.RoleBranchAdmin {
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if ok && bPtr != nil {
				branchID = bPtr
			}
		} else {
			// super_admin için query'den al
			bidStr := c.Query("branch_id")
			if bidStr != "" {
				var bid uint
				if _, err := fmt.Sscan(bidStr, &bid); err == nil && bid > 0 {
					branchID = &bid
				}
			}
		}

		entityType := c.Query("entity_type")
		entityIDStr := c.Query("entity_id")
		userIDStr := c.Query("user_id")

		dbq := database.DB.Model(&models.AuditLog{})

		// Branch filtresi
		if branchID != nil {
			dbq = dbq.Where("branch_id = ?", *branchID)
		}

		// User ID filtresi
		if userIDStr != "" {
			var uid uint
			if _, err := fmt.Sscan(userIDStr, &uid); err == nil && uid > 0 {
				dbq = dbq.Where("user_id = ?", uid)
			}
		}

		// Entity type filtresi
		if entityType != "" {
			dbq = dbq.Where("entity_type = ?", entityType)
		}

		// Entity ID filtresi
		if entityIDStr != "" {
			var eid uint
			if _, err := fmt.Sscan(entityIDStr, &eid); err == nil && eid > 0 {
				dbq = dbq.Where("entity_id = ?", eid)
			}
		}

		var logs []models.AuditLog
		if err := dbq.Order("created_at DESC").Find(&logs).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Loglar listelenemedi")
		}

		resp := make([]AuditLogResponse, 0, len(logs))
		for _, log := range logs {
			var undoneAtStr *string
			if log.UndoneAt != nil {
				formatted := log.UndoneAt.Format("2006-01-02 15:04:05")
				undoneAtStr = &formatted
			}

			resp = append(resp, AuditLogResponse{
				ID:          log.ID,
				CreatedAt:   log.CreatedAt.Format("2006-01-02 15:04:05"),
				BranchID:    log.BranchID,
				UserID:      log.UserID,
				UserName:    log.UserName,
				EntityType:  log.EntityType,
				EntityID:    log.EntityID,
				Action:      log.Action,
				Description: log.Description,
				IsUndone:    log.IsUndone,
				UndoneBy:    log.UndoneBy,
				UndoneAt:    undoneAtStr,
			})
		}

		return c.JSON(resp)
	}
}

// POST /api/audit-logs/:id/undo
func UndoAuditLogHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		logIDStr := c.Params("id")
		var logID uint
		if _, err := fmt.Sscan(logIDStr, &logID); err != nil || logID == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz log ID")
		}

		// Kullanıcı bilgileri
		userIDVal := c.Locals(auth.CtxUserIDKey)
		userID, ok := userIDVal.(uint)
		if !ok {
			return fiber.NewError(fiber.StatusForbidden, "Kullanıcı bilgisi alınamadı")
		}

		roleVal := c.Locals(auth.CtxUserRoleKey)
		role, ok := roleVal.(models.UserRole)
		if !ok {
			return fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
		}

		// Log'u al
		var log models.AuditLog
		if err := database.DB.First(&log, "id = ?", logID).Error; err != nil {
			return fiber.NewError(fiber.StatusNotFound, "Log bulunamadı")
		}

		// Yetki kontrolü
		if role == models.RoleSuperAdmin {
			// Super admin her şeyi geri alabilir
		} else if role == models.RoleBranchAdmin {
			// Branch admin kendi şubesindeki tüm kayıtları geri alabilir
			bVal := c.Locals(auth.CtxBranchIDKey)
			bPtr, ok := bVal.(*uint)
			if !ok || bPtr == nil {
				return fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
			}
			if log.BranchID == nil || *log.BranchID != *bPtr {
				return fiber.NewError(fiber.StatusForbidden, "Bu işlemi sadece kendi şubenizdeki kayıtları geri alabilirsiniz")
			}
		} else {
			return fiber.NewError(fiber.StatusForbidden, "Bu işlemi geri almak için yetkiniz yok")
		}

		// Kullanıcı adını al
		var user models.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kullanıcı bulunamadı")
		}

		// Undo işlemini gerçekleştir
		if err := UndoLog(logID, userID, user.Name); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}

		return c.JSON(fiber.Map{
			"message": "İşlem başarıyla geri alındı",
		})
	}
}

