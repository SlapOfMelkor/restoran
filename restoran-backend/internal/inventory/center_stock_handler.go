package inventory

import (
	"fmt"
	"time"

	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CreateCenterShipmentRequest struct {
	Date      string  `json:"date"` // "2025-12-09"
	ProductID uint    `json:"product_id"`
	Quantity  float64 `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
	Note      string  `json:"note"`
	BranchID  *uint   `json:"branch_id"` // super_admin için opsiyonel; branch_admin için yok
}

type CenterShipmentResponse struct {
	ID         uint    `json:"id"`
	BranchID   uint    `json:"branch_id"`
	ProductID  uint    `json:"product_id"`
	Product    string  `json:"product"`
	Date       string  `json:"date"`
	Quantity   float64 `json:"quantity"`
	UnitPrice  float64 `json:"unit_price"`
	TotalPrice float64 `json:"total_price"`
	Note       string  `json:"note"`
	CreatedAt  string  `json:"created_at"`
}

type CreateStockSnapshotRequest struct {
	Date      string                   `json:"date"` // "2025-12-01" veya "2025-12-31"
	ProductID uint                     `json:"product_id"`
	Type      models.StockSnapshotType `json:"type"` // start_of_month / end_of_month
	Quantity  float64                  `json:"quantity"`
	BranchID  *uint                    `json:"branch_id"` // super_admin için
}

type MonthlyStockRow struct {
	ProductID    uint    `json:"product_id"`
	ProductName  string  `json:"product_name"`
	Unit         string  `json:"unit"`
	StartQty     float64 `json:"start_qty"`
	EndQty       float64 `json:"end_qty"`
	IncomingQty  float64 `json:"incoming_qty"`
	UsedQty      float64 `json:"used_qty"`
	IncomingCost float64 `json:"incoming_cost"`
}

type MonthlyStockReportResponse struct {
	BranchID uint              `json:"branch_id"`
	Year     int               `json:"year"`
	Month    int               `json:"month"`
	Rows     []MonthlyStockRow `json:"rows"`
}

// Yardımcı: Kullanıcı bilgilerini al
func getUserInfo(c *fiber.Ctx) (uint, string, *uint, error) {
	userIDVal := c.Locals(auth.CtxUserRoleKey)
	_, ok := userIDVal.(models.UserRole)
	if !ok {
		return 0, "", nil, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	userIDVal2 := c.Locals(auth.CtxUserIDKey)
	userID, ok := userIDVal2.(uint)
	if !ok {
		return 0, "", nil, fiber.NewError(fiber.StatusForbidden, "Kullanıcı bilgisi alınamadı")
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return 0, "", nil, fiber.NewError(fiber.StatusInternalServerError, "Kullanıcı bulunamadı")
	}

	var branchID *uint
	bVal := c.Locals(auth.CtxBranchIDKey)
	if bPtr, ok := bVal.(*uint); ok && bPtr != nil {
		branchID = bPtr
	}

	return userID, user.Name, branchID, nil
}

// branch_id çöz (branch_admin -> JWT, super_admin -> body/query)
func resolveBranchIDFromBodyOrRole(c *fiber.Ctx, bodyBranchID *uint) (uint, error) {
	roleVal := c.Locals(auth.CtxUserRoleKey)
	role, ok := roleVal.(models.UserRole)
	if !ok {
		return 0, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	if role == models.RoleBranchAdmin {
		bVal := c.Locals(auth.CtxBranchIDKey)
		bPtr, ok := bVal.(*uint)
		if !ok || bPtr == nil {
			return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
		}
		return *bPtr, nil
	}

	// super_admin
	if bodyBranchID == nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
	}
	return *bodyBranchID, nil
}

func resolveBranchIDFromQueryOrRole(c *fiber.Ctx) (uint, error) {
	roleVal := c.Locals(auth.CtxUserRoleKey)
	role, ok := roleVal.(models.UserRole)
	if !ok {
		return 0, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	if role == models.RoleBranchAdmin {
		bVal := c.Locals(auth.CtxBranchIDKey)
		bPtr, ok := bVal.(*uint)
		if !ok || bPtr == nil {
			return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
		}
		return *bPtr, nil
	}

	// super_admin
	bidStr := c.Query("branch_id")
	if bidStr == "" {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id zorunlu")
	}
	var bid uint
	if _, err := fmt.Sscan(bidStr, &bid); err != nil || bid == 0 {
		return 0, fiber.NewError(fiber.StatusBadRequest, "branch_id geçersiz")
	}
	return bid, nil
}

// ---------------------------------------------
// MERKEZDEN GELEN ÜRÜN KAYDI
// POST /api/center-shipments
// ---------------------------------------------
func CreateCenterShipmentHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateCenterShipmentRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.ProductID == 0 || body.Quantity <= 0 || body.UnitPrice <= 0 {
			return fiber.NewError(fiber.StatusBadRequest, "product_id, quantity ve unit_price zorunlu ve 0'dan büyük olmalı")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// Ürün var mı?
		var product models.Product
		if err := database.DB.First(&product, "id = ?", body.ProductID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Ürün bulunamadı")
		}

		totalPrice := body.Quantity * body.UnitPrice

		sh := models.CenterShipment{
			BranchID:   branchID,
			ProductID:  body.ProductID,
			Date:       d,
			Quantity:   body.Quantity,
			UnitPrice:  body.UnitPrice,
			TotalPrice: totalPrice,
			Note:       body.Note,
		}

		if err := database.DB.Create(&sh).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kayıt oluşturulamadı")
		}

		// Audit log yaz
		userID, userName, branchIDPtr, err := getUserInfo(c)
		if err == nil {
			// branch_id log'da boş kalmasın; super_admin için body'den gelen branchID'yi kullan
			logBranchID := branchIDPtr
			if logBranchID == nil {
				logBranchID = &branchID
			}
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    logBranchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "center_shipment",
				EntityID:    sh.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Sevkiyat eklendi: %s - %.2f %s - %.2f TL", product.Name, sh.Quantity, product.Unit, sh.TotalPrice),
				Before:      nil,
				After:       sh,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(CenterShipmentResponse{
			ID:         sh.ID,
			BranchID:   sh.BranchID,
			ProductID:  sh.ProductID,
			Product:    product.Name,
			Date:       sh.Date.Format("2006-01-02"),
			Quantity:   sh.Quantity,
			UnitPrice:  sh.UnitPrice,
			TotalPrice: sh.TotalPrice,
			Note:       sh.Note,
			CreatedAt:  sh.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
}

// GET /api/center-shipments?from=...&to=...&product_id=...
func ListCenterShipmentsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		fromStr := c.Query("from")
		toStr := c.Query("to")
		productIDStr := c.Query("product_id")

		dbq := database.DB.Model(&models.CenterShipment{}).
			Preload("Product").
			Where("branch_id = ?", branchID)

		if fromStr != "" {
			from, err := time.Parse("2006-01-02", fromStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "from geçersiz")
			}
			dbq = dbq.Where("date >= ?", from)
		}
		if toStr != "" {
			to, err := time.Parse("2006-01-02", toStr)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "to geçersiz")
			}
			dbq = dbq.Where("date <= ?", to)
		}

		if productIDStr != "" {
			var pid uint
			if _, err := fmt.Sscan(productIDStr, &pid); err != nil || pid == 0 {
				return fiber.NewError(fiber.StatusBadRequest, "product_id geçersiz")
			}
			dbq = dbq.Where("product_id = ?", pid)
		}

		var records []models.CenterShipment
		if err := dbq.Order("date asc, id asc").Find(&records).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Kayıtlar listelenemedi")
		}

		resp := make([]CenterShipmentResponse, 0, len(records))
		for _, r := range records {
			resp = append(resp, CenterShipmentResponse{
				ID:         r.ID,
				BranchID:   r.BranchID,
				ProductID:  r.ProductID,
				Product:    r.Product.Name,
				Date:       r.Date.Format("2006-01-02"),
				Quantity:   r.Quantity,
				UnitPrice:  r.UnitPrice,
				TotalPrice: r.TotalPrice,
				Note:       r.Note,
				CreatedAt:  r.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(resp)
	}
}

// ---------------------------------------------
// STOK SNAPSHOT
// POST /api/stock-snapshots
// ---------------------------------------------
func CreateStockSnapshotHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body CreateStockSnapshotRequest
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi")
		}

		if body.ProductID == 0 || body.Quantity < 0 {
			return fiber.NewError(fiber.StatusBadRequest, "product_id zorunlu, quantity negatif olamaz")
		}

		if body.Type != models.SnapshotStartOfMonth && body.Type != models.SnapshotEndOfMonth {
			return fiber.NewError(fiber.StatusBadRequest, "type start_of_month veya end_of_month olmalı")
		}

		branchID, err := resolveBranchIDFromBodyOrRole(c, body.BranchID)
		if err != nil {
			return err
		}

		d, err := time.Parse("2006-01-02", body.Date)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tarih formatı 'YYYY-MM-DD' olmalı")
		}

		// ürün kontrol
		var product models.Product
		if err := database.DB.First(&product, "id = ?", body.ProductID).Error; err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Ürün bulunamadı")
		}

		ss := models.StockSnapshot{
			BranchID:     branchID,
			ProductID:    body.ProductID,
			SnapshotDate: d,
			Type:         body.Type,
			Quantity:     body.Quantity,
		}

		if err := database.DB.Create(&ss).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Stok snapshot kaydedilemedi")
		}

		// Audit log yaz
		userID, userName, branchIDPtr, err := getUserInfo(c)
		if err == nil {
			// branch_id log'da boş kalmasın; super_admin için body'den gelen branchID'yi kullan
			logBranchID := branchIDPtr
			if logBranchID == nil {
				logBranchID = &branchID
			}
			typeName := "Ay Başı"
			if ss.Type == models.SnapshotEndOfMonth {
				typeName = "Ay Sonu"
			}
			_ = audit.WriteLog(audit.LogOptions{
				BranchID:    logBranchID,
				UserID:      userID,
				UserName:    userName,
				EntityType:  "stock_snapshot",
				EntityID:    ss.ID,
				Action:      models.AuditActionCreate,
				Description: fmt.Sprintf("Stok snapshot eklendi: %s - %s - %.2f %s", product.Name, typeName, ss.Quantity, product.Unit),
				Before:      nil,
				After:       ss,
			})
		}

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"id":            ss.ID,
			"branch_id":     ss.BranchID,
			"product_id":    ss.ProductID,
			"snapshot_date": ss.SnapshotDate.Format("2006-01-02"),
			"type":          ss.Type,
			"quantity":      ss.Quantity,
		})
	}
}

type StockSnapshotResponse struct {
	ID           uint    `json:"id"`
	BranchID     uint    `json:"branch_id"`
	ProductID    uint    `json:"product_id"`
	ProductName  string  `json:"product_name"`
	SnapshotDate string  `json:"snapshot_date"`
	Type         string  `json:"type"`
	Quantity     float64 `json:"quantity"`
	CreatedAt    string  `json:"created_at"`
}

// GET /api/stock-snapshots
func ListStockSnapshotsHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		var snapshots []models.StockSnapshot
		if err := database.DB.
			Preload("Product").
			Where("branch_id = ?", branchID).
			Order("snapshot_date DESC, created_at DESC").
			Find(&snapshots).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Stok snapshot'ları listelenemedi")
		}

		res := make([]StockSnapshotResponse, 0, len(snapshots))
		for _, ss := range snapshots {
			res = append(res, StockSnapshotResponse{
				ID:           ss.ID,
				BranchID:     ss.BranchID,
				ProductID:    ss.ProductID,
				ProductName:  ss.Product.Name,
				SnapshotDate: ss.SnapshotDate.Format("2006-01-02"),
				Type:         string(ss.Type),
				Quantity:     ss.Quantity,
				CreatedAt:    ss.CreatedAt.Format("2006-01-02 15:04:05"),
			})
		}

		return c.JSON(res)
	}
}

// ---------------------------------------------
// AYLIK STOK RAPORU
// GET /api/stock-report/monthly?year=2025&month=12[&branch_id=1]
// ---------------------------------------------
func MonthlyStockReportHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := resolveBranchIDFromQueryOrRole(c)
		if err != nil {
			return err
		}

		yearStr := c.Query("year")
		monthStr := c.Query("month")
		if yearStr == "" || monthStr == "" {
			return fiber.NewError(fiber.StatusBadRequest, "year ve month zorunlu")
		}

		var year, month int
		if _, err := fmt.Sscan(yearStr, &year); err != nil || year < 2000 {
			return fiber.NewError(fiber.StatusBadRequest, "year geçersiz")
		}
		if _, err := fmt.Sscan(monthStr, &month); err != nil || month < 1 || month > 12 {
			return fiber.NewError(fiber.StatusBadRequest, "month geçersiz")
		}

		loc := time.Now().Location()
		firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
		lastDay := firstDay.AddDate(0, 1, -1)

		// snapshots: start
		type snapRow struct {
			ProductID uint    `gorm:"column:product_id"`
			Quantity  float64 `gorm:"column:quantity"`
		}
		var startRows []snapRow
		var endRows []snapRow

		// başı
		database.DB.
			Model(&models.StockSnapshot{}).
			Select("product_id, quantity").
			Where("branch_id = ? AND type = ? AND snapshot_date = ?", branchID, models.SnapshotStartOfMonth, firstDay).
			Scan(&startRows)

		// sonu
		database.DB.
			Model(&models.StockSnapshot{}).
			Select("product_id, quantity").
			Where("branch_id = ? AND type = ? AND snapshot_date = ?", branchID, models.SnapshotEndOfMonth, lastDay).
			Scan(&endRows)

		// Geri alınan (undo edilen) sevkiyatların ID'lerini bul
		type UndoneLog struct {
			EntityID uint `gorm:"column:entity_id"`
		}
		var undoneCenterShipmentIDs []UndoneLog
		var undoneShipmentIDs []UndoneLog
		
		// Geri alınan CenterShipment'ları bul
		database.DB.Model(&models.AuditLog{}).
			Select("entity_id").
			Where("entity_type = ? AND action = ? AND is_undone = ? AND (branch_id = ? OR branch_id IS NULL)", 
				"center_shipment", models.AuditActionCreate, true, branchID).
			Scan(&undoneCenterShipmentIDs)
		
		// Geri alınan Shipment'ları bul
		database.DB.Model(&models.AuditLog{}).
			Select("entity_id").
			Where("entity_type = ? AND action = ? AND is_undone = ? AND (branch_id = ? OR branch_id IS NULL)", 
				"shipment", models.AuditActionCreate, true, branchID).
			Scan(&undoneShipmentIDs)
		
		undoneCenterShipmentIDMap := make(map[uint]bool)
		for _, log := range undoneCenterShipmentIDs {
			undoneCenterShipmentIDMap[log.EntityID] = true
		}
		
		undoneShipmentIDMap := make(map[uint]bool)
		for _, log := range undoneShipmentIDs {
			undoneShipmentIDMap[log.EntityID] = true
		}
		
		// Tüm CenterShipment'ları al (geri alınanları filtrelemek için)
		var allCenterShipments []models.CenterShipment
		database.DB.
			Where("branch_id = ? AND date >= ? AND date <= ?", branchID, firstDay, lastDay).
			Find(&allCenterShipments)
		
		// Tüm Shipment'ları al (geri alınanları filtrelemek için)
		var allShipments []models.Shipment
		database.DB.
			Preload("Items").
			Where("branch_id = ? AND date >= ? AND date <= ? AND is_stocked = true", branchID, firstDay, lastDay).
			Find(&allShipments)
		
		// Sevkiyatları product_id'ye göre topla (geri alınanları hariç tut)
		type shipRow struct {
			ProductID    uint    `gorm:"column:product_id"`
			IncomingQty  float64 `gorm:"column:incoming_qty"`
			IncomingCost float64 `gorm:"column:incoming_cost"`
		}
		shipmentMap := make(map[uint]*shipRow)
		
		// CenterShipment'ları ekle
		for _, cs := range allCenterShipments {
			if undoneCenterShipmentIDMap[cs.ID] {
				continue // Geri alınmış sevkiyatları atla
			}
			row, ok := shipmentMap[cs.ProductID]
			if !ok {
				row = &shipRow{ProductID: cs.ProductID}
				shipmentMap[cs.ProductID] = row
			}
			row.IncomingQty += cs.Quantity
			row.IncomingCost += cs.TotalPrice
		}
		
		// Shipment'ları ekle
		for _, shipment := range allShipments {
			if undoneShipmentIDMap[shipment.ID] {
				continue // Geri alınmış sevkiyatları atla
			}
			for _, item := range shipment.Items {
				row, ok := shipmentMap[item.ProductID]
				if !ok {
					row = &shipRow{ProductID: item.ProductID}
					shipmentMap[item.ProductID] = row
				}
				row.IncomingQty += item.Quantity
				row.IncomingCost += item.TotalPrice
			}
		}
		
		// Map'i slice'a çevir
		var shipRows []shipRow
		for _, row := range shipmentMap {
			shipRows = append(shipRows, *row)
		}

		// product_id -> row agg
		type agg struct {
			StartQty     float64
			EndQty       float64
			IncomingQty  float64
			IncomingCost float64
		}
		data := make(map[uint]*agg)

		for _, s := range startRows {
			a, ok := data[s.ProductID]
			if !ok {
				a = &agg{}
				data[s.ProductID] = a
			}
			a.StartQty = s.Quantity
		}

		for _, e := range endRows {
			a, ok := data[e.ProductID]
			if !ok {
				a = &agg{}
				data[e.ProductID] = a
			}
			a.EndQty = e.Quantity
		}

		for _, sh := range shipRows {
			a, ok := data[sh.ProductID]
			if !ok {
				a = &agg{}
				data[sh.ProductID] = a
			}
			a.IncomingQty = sh.IncomingQty
			a.IncomingCost = sh.IncomingCost
		}

		// product id listesi
		ids := make([]uint, 0, len(data))
		for pid := range data {
			ids = append(ids, pid)
		}

		var products []models.Product
		if len(ids) > 0 {
			if err := database.DB.Where("id IN ?", ids).Find(&products).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Ürünler yüklenemedi")
			}
		}

		prodMap := make(map[uint]models.Product)
		for _, p := range products {
			prodMap[p.ID] = p
		}

		rows := make([]MonthlyStockRow, 0, len(data))
		for pid, a := range data {
			p, ok := prodMap[pid]
			if !ok {
				continue
			}
			used := a.StartQty + a.IncomingQty - a.EndQty
			if used < 0 {
				used = 0 // negatif olursa 0'a çekelim
			}

			rows = append(rows, MonthlyStockRow{
				ProductID:    pid,
				ProductName:  p.Name,
				Unit:         p.Unit,
				StartQty:     a.StartQty,
				EndQty:       a.EndQty,
				IncomingQty:  a.IncomingQty,
				UsedQty:      used,
				IncomingCost: a.IncomingCost,
			})
		}

		resp := MonthlyStockReportResponse{
			BranchID: branchID,
			Year:     year,
			Month:    month,
			Rows:     rows,
		}

		return c.JSON(resp)
	}
}
