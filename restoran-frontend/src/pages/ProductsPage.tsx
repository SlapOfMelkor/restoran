import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";

interface Product {
  id: number;
  name: string;
  unit: string;
  stock_code?: string;
  category?: string;
}

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState({
    name: "",
    unit: "",
    stock_code: "",
    category: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkImportData, setBulkImportData] = useState({
    prefix: "TM",
    start: 0,
    end: 9999,
    delay_ms: 500,
  });
  const [bulkImportLoading, setBulkImportLoading] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/products", { params: { is_center_product: "true" } });
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
      if (productFormData.category.trim()) {
        payload.category = productFormData.category.trim();
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
        if (productFormData.category.trim()) {
          updatePayload.category = productFormData.category.trim();
        } else {
          updatePayload.category = null;
        }
        await apiClient.put(`/admin/products/${editingProduct.id}`, updatePayload);
        alert("Ürün başarıyla güncellendi");
      } else {
        await apiClient.post("/admin/products", payload);
        alert("Ürün başarıyla oluşturuldu");
      }
      setProductFormData({ name: "", unit: "", stock_code: "", category: "" });
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
      category: prod.category || "",
    });
    setShowProductForm(true);
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`B2B sisteminden ${bulkImportData.prefix}${bulkImportData.start.toString().padStart(4, "0")} - ${bulkImportData.prefix}${bulkImportData.end.toString().padStart(4, "0")} aralığındaki tüm ürünleri içe aktarmak istediğinize emin misiniz? Bu işlem uzun sürebilir.`)) {
      return;
    }

    setBulkImportLoading(true);
    try {
      const res = await apiClient.post("/admin/products/bulk-import-b2b", bulkImportData);
      alert(`Toplu içe aktarma tamamlandı!\nİçe aktarılan: ${res.data.imported}\nAtlanan: ${res.data.skipped}\nHata: ${res.data.errors.length}`);
      if (res.data.errors.length > 0) {
        console.error("Bulk import hataları:", res.data.errors);
      }
      setShowBulkImportModal(false);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Toplu içe aktarma başarısız");
    } finally {
      setBulkImportLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <p className="text-xs text-[#222222]">
          Ürün bilgilerini yönetin
        </p>
        <div className="flex gap-2">
          {user?.role === "super_admin" && (
            <button
              onClick={() => setShowBulkImportModal(true)}
              className="px-4 py-2 rounded-lg text-sm transition-colors bg-green-600 hover:bg-green-700 text-white"
            >
              B2B'den Toplu İçe Aktar
            </button>
          )}
          <button
            onClick={() => {
              setShowProductForm(!showProductForm);
              setEditingProduct(null);
              setProductFormData({ name: "", unit: "", stock_code: "", category: "" });
            }}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
          >
            {showProductForm ? "Formu Gizle" : "Ürün Ekle"}
          </button>
        </div>
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
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Stok Kodu (Opsiyonel)
              </label>
              <input
                type="text"
                value={productFormData.stock_code}
                onChange={(e) =>
                  setProductFormData({
                    ...productFormData,
                    stock_code: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="TM0296"
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Kategori (Opsiyonel)
              </label>
              <input
                type="text"
                value={productFormData.category}
                onChange={(e) =>
                  setProductFormData({
                    ...productFormData,
                    category: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Ambalaj Grupları"
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
                  setProductFormData({ name: "", unit: "", stock_code: "", category: "" });
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
                    {product.category && (
                      <> • Kategori: {product.category}</>
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

      {/* B2B Toplu İçe Aktarma Modal */}
      {user?.role === "super_admin" && (
        <Modal
          isOpen={showBulkImportModal}
          onClose={() => setShowBulkImportModal(false)}
          title="B2B'den Toplu Ürün İçe Aktarma"
          maxWidth="lg"
        >
          <form onSubmit={handleBulkImport} className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                Bu işlem B2B sistemindeki tüm ürünleri tarayıp sisteme aktaracaktır. İşlem uzun sürebilir ve sunucuya yük bindirebilir.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#222222] mb-2">
                Stok Kodu Öneki
              </label>
              <select
                value={bulkImportData.prefix}
                onChange={(e) =>
                  setBulkImportData({ ...bulkImportData, prefix: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              >
                <option value="TM">TM</option>
                <option value="CD">CD</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  Başlangıç (0-9999)
                </label>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={bulkImportData.start}
                  onChange={(e) =>
                    setBulkImportData({
                      ...bulkImportData,
                      start: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  Bitiş (0-9999)
                </label>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={bulkImportData.end}
                  onChange={(e) =>
                    setBulkImportData({
                      ...bulkImportData,
                      end: parseInt(e.target.value) || 9999,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#222222] mb-2">
                İstekler Arası Gecikme (ms) - Rate Limiting için
              </label>
              <input
                type="number"
                min="0"
                max="10000"
                step="100"
                value={bulkImportData.delay_ms}
                onChange={(e) =>
                  setBulkImportData({
                    ...bulkImportData,
                    delay_ms: parseInt(e.target.value) || 500,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              />
              <p className="text-xs text-[#555555] mt-1">
                Önerilen: 500-1000ms (sunucuya yükü azaltır)
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={bulkImportLoading}
                className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
              >
                {bulkImportLoading ? "İçe Aktarılıyor..." : "İçe Aktar"}
              </button>
              <button
                type="button"
                onClick={() => setShowBulkImportModal(false)}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
