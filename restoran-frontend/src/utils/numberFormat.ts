/**
 * Input değiştiğinde formatla ve state'i güncelle
 * Kullanıcı 300000 yazdığında -> "300.000,00" gösterir
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
  
  // Sadece rakamları al (nokta ve virgülü kaldır)
  const digitsOnly = inputValue.replace(/\D/g, "");
  
  if (digitsOnly === "") {
    setValue("");
    return;
  }
  
  // Tam sayı olarak parse et (kullanıcı 300000 yazıyorsa 300000 TL demek istiyor)
  const numValue = parseFloat(digitsOnly);
  
  if (isNaN(numValue) || numValue < 0) {
    setValue("");
    return;
  }
  
  // Türkçe format: binlik ayırıcı nokta, ondalık ayırıcı virgül
  // Her zaman 2 ondalık basamak göster
  const formatted = numValue.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  setValue(formatted);
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

