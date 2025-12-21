package inventory

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// POST /api/shipments/parse-pdf
// PDF text'ini parse eder, ürün bilgilerini döndürür
// Frontend'den PDF text'i JSON body'de "text" field'ı olarak gönderilir
func ParseShipmentPDFHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Text string `json:"text"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz istek gövdesi. 'text' field'ı gönderilmelidir.")
		}

		if body.Text == "" {
			return fiber.NewError(fiber.StatusBadRequest, "PDF text'i boş olamaz")
		}

		// PDF text'ini parse et
		result, err := ParseShipmentPDF([]byte(body.Text))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("PDF text parse edilemedi: %v", err))
		}

		return c.JSON(result)
	}
}

