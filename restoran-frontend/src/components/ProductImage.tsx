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
  const retryCountRef = useRef(0); // Retry sayacı
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // stockCode değiştiğinde state'i sıfırla
  useEffect(() => {
    const newSrc = getImageUrl(stockCode);
    setImgSrc(newSrc);
    hasErrorRef.current = false;
    retryCountRef.current = 0;
    
    // Önceki retry timeout'ını temizle
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    // Cleanup function
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [stockCode]);

  // Boyut class'ları
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    const currentSrc = target.src || imgSrc;
    
    // Eğer zaten stock_image.jpg'yi gösteriyorsak, bir şey yapma
    if (currentSrc.includes("stock_image.jpg")) {
      return;
    }

    // Fotoğraf indirme süreci için retry mekanizması
    // İlk 3 denemede 2 saniye bekle (fotoğraf indirilene kadar zaman tanı)
    if (retryCountRef.current < 3 && stockCode) {
      retryCountRef.current += 1;
      
      // Debug: console'a log at
      console.warn(`ProductImage retry (${retryCountRef.current}/3) - StockCode: ${stockCode}`);
      
      // 2 saniye bekle ve tekrar dene
      retryTimeoutRef.current = setTimeout(() => {
        const originalUrl = getImageUrl(stockCode);
        setImgSrc(originalUrl + "?retry=" + Date.now()); // Cache bypass için timestamp ekle
      }, 2000);
      
      return;
    }

    // 3 denemeden sonra hala yüklenemediyse stock_image.jpg'yi göster
    if (!hasErrorRef.current) {
      hasErrorRef.current = true;
      console.warn(`ProductImage fallback to stock_image - StockCode: ${stockCode}`);
      const stockImageUrl = "/product-images/stock_image.jpg";
      setImgSrc(stockImageUrl);
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

