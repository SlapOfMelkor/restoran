import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface Product {
  id: number;
  name: string;
  unit: string;
  stock_code?: string;
}

export const ProductsPage: React.FC = () => {
  const { } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState({
    name: "",
    unit: "",
    stock_code: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/products");
      setProducts(res.data);
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormData.name.trim() || !productFormData.unit.trim()) {
      alert("Lütfen ürün adı ve birim girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: productFormData.name.trim(),
        unit: productFormData.unit.trim(),
      };
      if (productFormData.stock_code.trim()) {
        payload.stock_code = productFormData.stock_code.trim();
      }

      if (editingProduct) {
        const updatePayload: any = {
          name: productFormData.name.trim(),
          unit: productFormData.unit.trim(),
        };
        if (productFormData.stock_code.trim()) {
          updatePayload.stock_code = productFormData.stock_code.trim();
        } else {
          updatePayload.stock_code = null; // Boş string'i null'a çevir (silme için)
        }
        await apiClient.put(`/admin/products/${editingProduct.id}`, updatePayload);
        alert("Ürün başarıyla güncellendi");
      } else {
        await apiClient.post("/admin/products", payload);
        alert("Ürün başarıyla oluşturuldu");
      }
      setProductFormData({ name: "", unit: "", stock_code: "" });
      setShowProductForm(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ürün işlemi başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/admin/products/${id}`);
      alert("Ürün başarıyla silindi");
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ürün silinemedi");
    }
  };

  const startEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductFormData({
      name: prod.name,
      unit: prod.unit,
      stock_code: prod.stock_code || "",
    });
    setShowProductForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Ürün bilgilerini yönetin
        </p>
        <button
          onClick={() => {
            setShowProductForm(!showProductForm);
            setEditingProduct(null);
            setProductFormData({ name: "", unit: "", stock_code: "" });
          }}
          className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
        >
          {showProductForm ? "Formu Gizle" : "Ürün Ekle"}
        </button>
      </div>

      {/* Ürün Formu */}
      {showProductForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">
            {editingProduct ? "Ürün Düzenle" : "Yeni Ürün"}
          </h2>
          <form onSubmit={handleProductSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Ürün Adı
              </label>
              <input
                type="text"
                value={productFormData.name}
                onChange={(e) =>
                  setProductFormData({
                    ...productFormData,
                    name: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Örn: Dana Eti"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Birim
              </label>
              <input
                type="text"
                value={productFormData.unit}
                onChange={(e) =>
                  setProductFormData({
                    ...productFormData,
                    unit: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="kg, adet, koli, litre..."
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
              >
                {submitting
                  ? editingProduct
                    ? "Güncelleniyor..."
                    : "Oluşturuluyor..."
                  : editingProduct
                  ? "Güncelle"
                  : "Oluştur"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProductForm(false);
                  setEditingProduct(null);
                  setProductFormData({ name: "", unit: "", stock_code: "" });
                }}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ürünler Listesi */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3 text-[#8F1A9F]">Ürünler</h2>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : products.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz ürün yok</p>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#E5E5E5]"
              >
                <div>
                  <div className="text-sm font-medium">{product.name}</div>
                  <div className="text-xs text-[#222222]">
                    Birim: {product.unit}
                    {product.stock_code && (
                      <> • Stok Kodu: {product.stock_code}</>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditProduct(product)}
                    className="px-3 py-1 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors text-white"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="px-3 py-1 bg-[#D32F2F] hover:bg-[#B71C1C] rounded text-xs transition-colors text-white"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
