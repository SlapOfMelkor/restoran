package main

import (
	"log"
	"strings"
	"restoran-backend/internal/admin"
	"restoran-backend/internal/audit"
	"restoran-backend/internal/auth"
	"restoran-backend/internal/cashflow"
	"restoran-backend/internal/config"
	"restoran-backend/internal/dashboard"
	"restoran-backend/internal/database"
	"restoran-backend/internal/expense"
	"restoran-backend/internal/financial"
	"restoran-backend/internal/inventory"
	"restoran-backend/internal/models"
	"restoran-backend/internal/produce"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func main() {
	cfg := config.Load()
	database.Init(cfg)

	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			if e, ok := err.(*fiber.Error); ok {
				return c.Status(e.Code).JSON(fiber.Map{
					"error": e.Message,
				})
			}
			log.Println("Unexpected error:", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Beklenmeyen sunucu hatası",
			})
		},
	})

	// 🔥 CORS MIDDLEWARE
	// CORS origins'i virgülle ayrılmış string'den array'e çevir
	corsOrigins := strings.Split(cfg.CORSOrigins, ",")
	for i := range corsOrigins {
		corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins: strings.Join(corsOrigins, ","),
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
	}))

	api := app.Group("/api")

	// Public auth
	api.Post("/auth/register-super-admin", auth.RegisterSuperAdminHandler(cfg))
	api.Post("/auth/login", auth.LoginHandler(cfg))

	// Protected
	protected := api.Group("")
	protected.Use(auth.JWTMiddleware(cfg))

	protected.Get("/auth/me", auth.MeHandler())

	// Super admin routes
	adminRoutes := protected.Group("/admin")
	adminRoutes.Use(auth.RequireRole(models.RoleSuperAdmin))

	// Şube yönetimi
	adminRoutes.Post("/branches", admin.CreateBranchHandler())
	adminRoutes.Get("/branches", admin.ListBranchesHandler())
	adminRoutes.Get("/branches/:id", admin.GetBranchHandler())
	adminRoutes.Put("/branches/:id", admin.UpdateBranchHandler())
	adminRoutes.Delete("/branches/:id", admin.DeleteBranchHandler())
	adminRoutes.Post("/branches/:id/admin", admin.CreateBranchAdminHandler())
	adminRoutes.Get("/branches/:id/admins", admin.ListBranchAdminsHandler())

	// Ürün yönetimi
	adminRoutes.Post("/products", inventory.CreateProductHandler())
	adminRoutes.Put("/products/:id", inventory.UpdateProductHandler())
	adminRoutes.Delete("/products/:id", inventory.DeleteProductHandler())

	// Gider kategorileri
	adminRoutes.Post("/expense-categories", expense.CreateExpenseCategoryHandler())
	adminRoutes.Put("/expense-categories/:id", expense.UpdateExpenseCategoryHandler())
	adminRoutes.Delete("/expense-categories/:id", expense.DeleteExpenseCategoryHandler())

	// Banka/Kart yönetimi
	adminRoutes.Post("/bank-accounts", admin.CreateBankAccountHandler())
	adminRoutes.Get("/bank-accounts", admin.ListBankAccountsHandler())
	adminRoutes.Put("/bank-accounts/:id", admin.UpdateBankAccountHandler())
	adminRoutes.Delete("/bank-accounts/:id", admin.DeleteBankAccountHandler())

	// Aylık raporlama
	adminRoutes.Post("/monthly-reports", admin.CreateMonthlyReportHandler())
	adminRoutes.Get("/monthly-reports", admin.ListMonthlyReportsHandler())
	adminRoutes.Get("/monthly-reports/:id", admin.GetMonthlyReportHandler())

	// Ortak (auth gerektiren) route’lar

	// Ürün listesi
	protected.Get("/products", inventory.ListProductsHandler())

	// Para giriş/çıkış
	protected.Post("/cash-movements", cashflow.CreateCashMovementHandler())
	protected.Get("/cash-movements", cashflow.ListCashMovementsHandler())
	protected.Get("/cash-movements/summary/monthly", cashflow.MonthlySummaryHandler())

	// Dashboard
	protected.Get("/dashboard/cash-chart", dashboard.CashChartHandler())

	// Merkez sevkiyatları & stok (eski - geriye dönük uyumluluk için)
	protected.Post("/center-shipments", inventory.CreateCenterShipmentHandler())
	protected.Get("/center-shipments", inventory.ListCenterShipmentsHandler())
	protected.Post("/stock-snapshots", inventory.CreateStockSnapshotHandler())
	protected.Get("/stock-snapshots", inventory.ListStockSnapshotsHandler())
	protected.Get("/stock-report/monthly", inventory.MonthlyStockReportHandler())

	// Yeni sevkiyat sistemi
	protected.Post("/shipments", inventory.CreateShipmentHandler())
	protected.Get("/shipments", inventory.ListShipmentsHandler())
	protected.Post("/shipments/:id/stock", inventory.StockShipmentHandler())
	protected.Post("/shipments/parse-pdf", inventory.ParseShipmentPDFHandler()) // PDF parsing endpoint

	// Yeni stok sistemi
	protected.Post("/stock-entries", inventory.CreateStockEntryHandler())
	protected.Get("/stock-entries", inventory.ListStockEntriesHandler())
	protected.Get("/stock-entries/current", inventory.GetCurrentStockHandler())
	protected.Get("/stock-entries/usage-between-counts", inventory.GetStockUsageBetweenCountsHandler())
	protected.Get("/stock-usage/monthly", inventory.GetMonthlyStockUsageHandler())

	// Zayiat girişleri
	protected.Post("/waste-entries", inventory.CreateWasteEntryHandler())
	protected.Get("/waste-entries", inventory.ListWasteEntriesHandler())
	protected.Get("/waste-entries/:id", inventory.GetWasteEntryHandler())
	protected.Delete("/waste-entries/:id", inventory.DeleteWasteEntryHandler())

	// Giderler
	protected.Get("/expense-categories", expense.ListExpenseCategoriesHandler())
	protected.Post("/expenses", expense.CreateExpenseHandler())
	protected.Get("/expenses", expense.ListExpensesHandler())
	protected.Get("/expenses/summary/monthly", expense.MonthlyExpenseSummaryHandler())
	protected.Post("/expense-payments", expense.CreateExpensePaymentHandler())
	protected.Get("/expense-payments", expense.ListExpensePaymentsHandler())
	protected.Get("/expense-payments/balance-by-category", expense.GetCategoryExpenseBalanceHandler())

	// Manav yönetimi
	protected.Post("/produce-purchases", produce.CreateProducePurchaseHandler())
	protected.Get("/produce-purchases", produce.ListProducePurchasesHandler())
	protected.Get("/produce-purchases/balance", produce.GetProduceBalanceHandler())
	protected.Get("/produce-purchases/monthly-usage", produce.GetMonthlyProduceUsageHandler())
	protected.Post("/produce-payments", produce.CreateProducePaymentHandler())
	protected.Get("/produce-payments", produce.ListProducePaymentsHandler())

	// Genel finansal özet (eski)
	protected.Get("/financial-summary/monthly", financial.MonthlyFinancialSummaryHandler())

	// Yeni finansal özet (günlük, haftalık, aylık)
	protected.Get("/financial-summary/daily", cashflow.GetDailyFinancialSummaryHandler())
	protected.Get("/financial-summary/weekly", cashflow.GetWeeklyFinancialSummaryHandler())
	protected.Get("/financial-summary/monthly-new", cashflow.GetMonthlyFinancialSummaryHandler())

	// Audit logs
	protected.Get("/audit-logs", audit.ListAuditLogsHandler())
	protected.Post("/audit-logs/:id/undo", audit.UndoAuditLogHandler())

	log.Println("Server çalışıyor port:", cfg.HTTPPort)
	if err := app.Listen(":" + cfg.HTTPPort); err != nil {
		log.Fatal(err)
	}
}
