import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface BankAccount {
  id: number;
  branch_id: number;
  type: "bank" | "credit_card";
  name: string;
  account_number: string;
  balance: number;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const BankStatusPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState({
    type: "bank" as "bank" | "credit_card",
    name: "",
    account_number: "",
    balance: "",
    description: "",
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/admin/bank-accounts", { params });
      setAccounts(res.data);
    } catch (err) {
      console.error("Hesaplar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "super_admin" || user?.role === "branch_admin") {
      fetchAccounts();
    }
  }, [user, selectedBranchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        type: formData.type,
        name: formData.name,
        account_number: formData.account_number,
        balance: parseFloat(formData.balance) || 0,
        description: formData.description,
        is_active: formData.is_active,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      if (editingAccount) {
        await apiClient.put(`/admin/bank-accounts/${editingAccount.id}`, payload);
        alert("Hesap başarıyla güncellendi");
      } else {
        await apiClient.post("/admin/bank-accounts", payload);
        alert("Hesap başarıyla oluşturuldu");
      }

      setFormData({
        type: "bank",
        name: "",
        account_number: "",
        balance: "",
        description: "",
        is_active: true,
      });
      setEditingAccount(null);
      setShowForm(false);
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error || "İşlem başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setFormData({
      type: account.type,
      name: account.name,
      account_number: account.account_number,
      balance: account.balance.toString(),
      description: account.description,
      is_active: account.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu hesabı silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/admin/bank-accounts/${id}`);
      alert("Hesap başarıyla silindi");
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Silme işlemi başarısız");
    }
  };

  const handleUpdateBalance = async (_id: number, _newBalance: number) => {
    try {
      await apiClient.put(`/admin/bank-accounts/${id}`, { balance: newBalance });
      alert("Bakiye güncellendi");
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Bakiye güncellenemedi");
    }
  };

  const bankAccounts = accounts.filter((a) => a.type === "bank");
  const creditCards = accounts.filter((a) => a.type === "credit_card");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Banka hesapları ve kredi kartı bilgilerini yönetin
        </p>
        {user?.role === "super_admin" && (
          <button
            onClick={() => {
              setEditingAccount(null);
              setFormData({
                type: "bank",
                name: "",
                account_number: "",
                balance: "",
                description: "",
                is_active: true,
              });
              setShowForm(!showForm);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors"
          >
            {showForm ? "Formu Gizle" : "Yeni Hesap/Kart"}
          </button>
        )}
      </div>

      {showForm && user?.role === "super_admin" && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">
            {editingAccount ? "Hesap/Kart Düzenle" : "Yeni Hesap/Kart Ekle"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">Tip</label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as "bank" | "credit_card" })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              >
                <option value="bank">Banka Hesabı</option>
                <option value="credit_card">Kredi Kartı</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">Ad</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Örn: Ziraat Bankası, Visa Kredi Kartı"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">Hesap/Kart Numarası</label>
              <input
                type="text"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Opsiyonel"
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                {formData.type === "bank" ? "Bakiye" : "Borç"} (TL)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">Açıklama</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Opsiyonel"
              />
            </div>
            {editingAccount && (
              <div>
                <label className="flex items-center gap-2 text-xs text-[#555555]">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded"
                  />
                  Aktif
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
              >
                {submitting ? "Kaydediliyor..." : editingAccount ? "Güncelle" : "Ekle"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingAccount(null);
                }}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Banka Hesapları */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">Banka Hesapları</h2>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : bankAccounts.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz banka hesabı yok</p>
        ) : (
          <div className="space-y-2">
            {bankAccounts.map((account) => (
              <div
                key={account.id}
                className={`p-3 bg-white rounded-xl border ${
                  !account.is_active ? "border-slate-600 opacity-60" : "border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{account.name}</div>
                    {account.account_number && (
                      <div className="text-xs text-[#222222]">
                        Hesap: {account.account_number}
                      </div>
                    )}
                    {account.description && (
                      <div className="text-xs text-[#222222]">{account.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                    <div className="text-xs text-[#222222]">Bakiye</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {account.balance.toFixed(2)} TL
                      </div>
                    </div>
                    {user?.role === "super_admin" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(account)}
                          className="px-3 py-1.5 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors text-white"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => handleDelete(account.id)}
                          className="px-3 py-1.5 bg-[#D32F2F] hover:bg-[#B71C1C] rounded text-xs transition-colors text-white"
                        >
                          Sil
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kredi Kartları */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">Kredi Kartları</h2>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : creditCards.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz kredi kartı yok</p>
        ) : (
          <div className="space-y-2">
            {creditCards.map((card) => (
              <div
                key={card.id}
                className={`p-3 bg-white rounded-xl border ${
                  !card.is_active ? "border-slate-600 opacity-60" : "border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{card.name}</div>
                    {card.account_number && (
                      <div className="text-xs text-[#222222]">
                        Kart: {card.account_number}
                      </div>
                    )}
                    {card.description && (
                      <div className="text-xs text-[#222222]">{card.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                    <div className="text-xs text-[#222222]">Borç</div>
                      <div className="text-sm font-bold text-red-400">
                        {card.balance.toFixed(2)} TL
                      </div>
                    </div>
                    {user?.role === "super_admin" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(card)}
                          className="px-3 py-1.5 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors text-white"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => handleDelete(card.id)}
                          className="px-3 py-1.5 bg-[#D32F2F] hover:bg-[#B71C1C] rounded text-xs transition-colors text-white"
                        >
                          Sil
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

