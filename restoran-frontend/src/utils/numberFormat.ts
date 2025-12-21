/**
 * Input değiştiğinde formatla ve state'i güncelle
 * Kullanıcı yazarken binlik ayırıcıları gösterir
 * 2000 -> "2.000,00", 5000000 -> "5.000.000,00"
 */
export const handleNumberInputChange = (
  e: React.ChangeEvent<HTMLInputElement>,
  setValue: (value: string) => void
) => {
  const inputValue = e.target.value;
  
  // Eğer kullanıcı silmek istiyorsa
  if (inputValue === "") {
    setValue("");
    return;
  }
  
  // Binlik ayırıcı noktaları kaldır
  let cleaned = inputValue.replace(/\./g, "");
  
  // Virgül varsa, virgülden önce ve sonraki kısımları ayır
  const commaIndex = cleaned.indexOf(",");
  let integerPart = "";
  let decimalPart = "";
  
  if (commaIndex !== -1) {
    integerPart = cleaned.substring(0, commaIndex).replace(/\D/g, "");
    decimalPart = cleaned.substring(commaIndex + 1).replace(/\D/g, "").slice(0, 2); // En fazla 2 ondalık basamak
  } else {
    // Virgül yok, sadece rakamları al
    integerPart = cleaned.replace(/\D/g, "");
  }
  
  if (integerPart === "" && decimalPart === "") {
    setValue("");
    return;
  }
  
  // Tam sayı kısmını parse et
  const integer = integerPart === "" ? 0 : parseInt(integerPart);
  
  if (isNaN(integer) || integer < 0) {
    setValue("");
    return;
  }
  
  // Binlik ayırıcı ekle
  const formattedInteger = integer.toLocaleString("tr-TR");
  
  // Ondalık kısım varsa ekle
  if (commaIndex !== -1) {
    const formattedDecimal = decimalPart.padEnd(2, "0");
    setValue(`${formattedInteger},${formattedDecimal}`);
  } else {
    // Ondalık kısım yok, her zaman ",00" ekle
    setValue(`${formattedInteger},00`);
  }
};

/**
 * Form submit edilirken formatlanmış değeri sayıya çevir
 * "300.000,00" -> 300000.00
 */
export const getNumberValue = (formattedValue: string): number => {
  if (!formattedValue) return 0;
  
  // Binlik ayırıcı noktaları kaldır, virgülü noktaya çevir
  const cleaned = formattedValue
    .replace(/\./g, "") // Binlik ayırıcı noktaları kaldır
    .replace(/,/g, "."); // Virgülü noktaya çevir (ondalık için)
  
  const numValue = parseFloat(cleaned);
  return isNaN(numValue) ? 0 : numValue;
};

