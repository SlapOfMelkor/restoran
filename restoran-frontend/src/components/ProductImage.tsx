import React from "react";

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

  // Boyut class'ları
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  const imageUrl = getImageUrl(stockCode);

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <img
        src={imageUrl}
        alt={productName}
        className={`${sizeClasses[size]} object-cover rounded border border-gray-200`}
        onError={(e) => {
          // Fotoğraf yüklenemezse placeholder göster
          const target = e.target as HTMLImageElement;
          if (target.src !== "/product-images/placeholder.jpg") {
            target.src = "/product-images/placeholder.jpg";
          }
        }}
      />
    </div>
  );
};

