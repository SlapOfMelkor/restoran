package dashboard

import (
	"fmt"
	"time"

	"restoran-backend/internal/auth"
	"restoran-backend/internal/database"
	"restoran-backend/internal/models"

	"github.com/gofiber/fiber/v2"
)

type CashChartPoint struct {
	Label       string  `json:"label"` // tarih / hafta başlangıcı / ay başlangıcı
	Cash        float64 `json:"cash"`
	POS         float64 `json:"pos"`
	YemekSepeti float64 `json:"yemeksepeti"`
	Total       float64 `json:"total"`
}

type CashChartGrandTotals struct {
	Cash        float64 `json:"cash"`
	POS         float64 `json:"pos"`
	YemekSepeti float64 `json:"yemeksepeti"`
	Total       float64 `json:"total"`
}

type CashChartResponse struct {
	BranchID    uint                 `json:"branch_id"`
	Period      string               `json:"period"` // daily | weekly | monthly
	From        string               `json:"from"`
	To          string               `json:"to"`
	Points      []CashChartPoint     `json:"points"`
	GrandTotals CashChartGrandTotals `json:"grand_totals"`
}

// context'ten branch id çıkar (branch_admin için JWT, super_admin için query param)
// super_admin için ?branch_id=1 zorunlu
func getBranchIDFromContext(c *fiber.Ctx) (uint, error) {
	roleVal := c.Locals(auth.CtxUserRoleKey)
	role, ok := roleVal.(models.UserRole)
	if !ok {
		return 0, fiber.NewError(fiber.StatusForbidden, "Rol bilgisi alınamadı")
	}

	if role == models.RoleBranchAdmin {
		branchIDVal := c.Locals(auth.CtxBranchIDKey)
		branchIDPtr, ok := branchIDVal.(*uint)
		if !ok || branchIDPtr == nil {
			return 0, fiber.NewError(fiber.StatusForbidden, "Şube bilgisi bulunamadı")
		}
		return *branchIDPtr, nil
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

// GET /api/dashboard/cash-chart?period=daily&count=7&branch_id=1
func CashChartHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		branchID, err := getBranchIDFromContext(c)
		if err != nil {
			return err
		}

		period := c.Query("period", "daily") // daily | weekly | monthly
		countStr := c.Query("count", "")

		var count int
		if countStr == "" {
			switch period {
			case "weekly":
				count = 8
			case "monthly":
				count = 12
			default:
				period = "daily"
				count = 7
			}
		} else {
			if _, err := fmt.Sscan(countStr, &count); err != nil || count <= 0 {
				return fiber.NewError(fiber.StatusBadRequest, "count geçersiz")
			}
		}

		now := time.Now()
		loc := now.Location()
		// bugünün 00:00'ı
		end := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
		var start time.Time

		switch period {
		case "weekly":
			// count hafta geriye
			days := 7 * (count - 1)
			start = end.AddDate(0, 0, -days)
		case "monthly":
			// ilgili ayların başından itibaren
			end = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
			start = end.AddDate(0, -(count - 1), 0)
		default:
			// daily
			period = "daily"
			start = end.AddDate(0, 0, -(count - 1))
		}

		// aggregation sonucu satır yapısı
		type row struct {
			Bucket time.Time `gorm:"column:bucket"`
			Method string    `gorm:"column:method"`
			Total  float64   `gorm:"column:total"`
		}
		var rows []row

		var sql string
		switch period {
		case "weekly":
			sql = `
				SELECT date_trunc('week', date)::date AS bucket,
					   method,
					   SUM(amount) AS total
				FROM cash_movements
				WHERE branch_id = ? AND direction = 'in' AND date >= ? AND date <= ?
				GROUP BY bucket, method
				ORDER BY bucket ASC;
			`
		case "monthly":
			sql = `
				SELECT date_trunc('month', date)::date AS bucket,
					   method,
					   SUM(amount) AS total
				FROM cash_movements
				WHERE branch_id = ? AND direction = 'in' AND date >= ? AND date < ?
				GROUP BY bucket, method
				ORDER BY bucket ASC;
			`
			// monthly için end = start + count ay sonrası
			end = start.AddDate(0, count, 0).AddDate(0, 0, -1)
		default: // daily
			sql = `
				SELECT date::date AS bucket,
					   method,
					   SUM(amount) AS total
				FROM cash_movements
				WHERE branch_id = ? AND direction = 'in' AND date >= ? AND date <= ?
				GROUP BY bucket, method
				ORDER BY bucket ASC;
			`
		}

		if err := database.DB.Raw(sql, branchID, start, end).Scan(&rows).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Veri toplanırken hata oluştu")
		}

		// bucket bazlı toplama
		type bucketAgg struct {
			Bucket      time.Time
			Cash        float64
			POS         float64
			YemekSepeti float64
			Total       float64
		}

		buckets := make(map[time.Time]*bucketAgg)

		for _, r := range rows {
			agg, ok := buckets[r.Bucket]
			if !ok {
				agg = &bucketAgg{Bucket: r.Bucket}
				buckets[r.Bucket] = agg
			}

			switch r.Method {
			case string(models.CashMethodCash):
				agg.Cash += r.Total
			case string(models.CashMethodPOS):
				agg.POS += r.Total
			case string(models.CashMethodYemekSepeti):
				agg.YemekSepeti += r.Total
			}
		}

		// map'ten slice'a taşı ve sıralı hale getir
		ordered := make([]bucketAgg, 0, len(buckets))
		for _, v := range buckets {
			v.Total = v.Cash + v.POS + v.YemekSepeti
			ordered = append(ordered, *v)
		}

		// tarih sıralaması
		for i := 0; i < len(ordered); i++ {
			for j := i + 1; j < len(ordered); j++ {
				if ordered[j].Bucket.Before(ordered[i].Bucket) {
					ordered[i], ordered[j] = ordered[j], ordered[i]
				}
			}
		}

		points := make([]CashChartPoint, 0, len(ordered))
		grand := CashChartGrandTotals{}

		for _, b := range ordered {
			label := b.Bucket.Format("2006-01-02")
			points = append(points, CashChartPoint{
				Label:       label,
				Cash:        b.Cash,
				POS:         b.POS,
				YemekSepeti: b.YemekSepeti,
				Total:       b.Total,
			})

			grand.Cash += b.Cash
			grand.POS += b.POS
			grand.YemekSepeti += b.YemekSepeti
			grand.Total += b.Total
		}

		resp := CashChartResponse{
			BranchID:    branchID,
			Period:      period,
			From:        start.Format("2006-01-02"),
			To:          end.Format("2006-01-02"),
			Points:      points,
			GrandTotals: grand,
		}

		return c.JSON(resp)
	}
}
