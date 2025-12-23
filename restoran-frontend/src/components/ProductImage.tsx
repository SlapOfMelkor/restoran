import React, { useState, useEffect, useRef } from "react";

interface ProductImageProps {
  stockCode?: string;
  productName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Ürün fotoğrafını gösteren component
 * @param stockCode - Ürün stok kodu (fotoğraf dosya adı için kullanılır)
 * @param productName - Ürün adı (alt text ve placeholder için)
 * @param size - Görsel boyutu: sm (40x40), md (64x64), lg (96x96)
 * @param className - Ek CSS class'ları
 */
export const ProductImage: React.FC<ProductImageProps> = ({
  stockCode,
  productName = "Ürün",
  size = "md",
  className = "",
}) => {
  // Stok koduna göre fotoğraf URL'i oluştur
  const getImageUrl = (code?: string): string => {
    if (!code) {
      return "/product-images/placeholder.jpg";
    }
    return `/product-images/${code}.jpg`;
  };

  const initialSrc = getImageUrl(stockCode);
  const [imgSrc, setImgSrc] = useState<string>(initialSrc);
  const hasErrorRef = useRef(false); // Ref kullanarak sync kontrol

  // stockCode değiştiğinde state'i sıfırla
  useEffect(() => {
    const newSrc = getImageUrl(stockCode);
    setImgSrc(newSrc);
    hasErrorRef.current = false;
  }, [stockCode]);

  // Boyut class'ları
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Sadece bir kez hata durumuna geç (sonsuz döngüyü önle)
    if (hasErrorRef.current) {
      return; // Zaten hata durumundayız, tekrar deneme
    }

    const target = e.target as HTMLImageElement;
    const currentSrc = target.src || imgSrc;
    
    // Debug: console'a log at
    console.warn(`ProductImage yükleme hatası - StockCode: ${stockCode}, Src: ${currentSrc}`);
    
    // Eğer şu anki src placeholder veya data URI değilse, placeholder'a geç
    if (!currentSrc.includes("placeholder.jpg") && !currentSrc.includes("data:image")) {
      hasErrorRef.current = true;
      const placeholderUrl = "/product-images/placeholder.jpg";
      setImgSrc(placeholderUrl);
    } else if (currentSrc.includes("placeholder.jpg") && !currentSrc.includes("data:image")) {
      // Placeholder da yüklenemezse, gri bir SVG göster (sonsuz döngüyü önle)
      hasErrorRef.current = true;
      const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3C/svg%3E";
      setImgSrc(fallbackSvg);
    }
  };

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <img
        src={imgSrc}
        alt={productName}
        className={`${sizeClasses[size]} object-cover rounded border border-gray-200`}
        onError={handleError}
        loading="lazy"
      />
    </div>
  );
};

