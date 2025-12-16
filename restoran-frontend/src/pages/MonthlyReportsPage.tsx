import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface MonthlyReport {
  id: number;
  branch_id: number;
  year: number;
  month: number;
  report_date: string;
  total_revenue: number;
  total_expenses: number;
  total_shipments: number;
  net_profit: number;
  created_at: string;
}

interface ReportDetail {
  id: number;
  branch_id: number;
  year: number;
  month: number;
  report_date: string;
  total_revenue: number;
  total_expenses: number;
  total_shipments: number;
  net_profit: number;
  report_data?: {
    cash_movements?: any[];
    expenses?: any[];
    shipments?: any[];
  };
  created_at: string;
}

export const MonthlyReportsPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/admin/monthly-reports", { params });
      setReports(res.data);
    } catch (err) {
      console.error("Raporlar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [user, selectedBranchId]);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirm(
      `Bu işlem ${formData.year} yılının ${formData.month}. ayı için rapor oluşturacak ve TÜM VERİLERİ SIFIRLAYACAKTIR!\n\n` +
      `Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?`
    )) {
      return;
    }

    if (!confirm("Son bir kez onaylıyor musunuz? Bu işlem geri alınamaz!")) {
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        year: formData.year,
        month: formData.month,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/admin/monthly-reports", payload);
      alert("Rapor başarıyla oluşturuldu ve veriler sıfırlandı");
      setShowCreateForm(false);
      fetchReports();
    } catch (err: any) {
      alert(err.response?.data?.error || "Rapor oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReport = async (reportId: number) => {
    try {
      const res = await apiClient.get(`/admin/monthly-reports/${reportId}`);
      console.log("Rapor detayı:", res.data);
      setSelectedReport(res.data);
    } catch (err: any) {
      console.error("Rapor detayı yüklenemedi:", err);
      alert(err.response?.data?.error || "Rapor detayı yüklenemedi");
    }
  };

  const getMonthName = (month: number) => {
    const months = [
      "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
      "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];
    return months[month - 1] || "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Aylık raporları oluşturun, görüntüleyin ve verileri sıfırlayın
        </p>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors"
        >
          {showCreateForm ? "Formu Gizle" : "Yeni Rapor Oluştur"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3 text-yellow-400">
            ⚠️ DİKKAT: Bu işlem verileri sıfırlayacaktır!
          </h2>
          <form onSubmit={handleCreateReport} className="space-y-3">
            <div className="bg-red-900/20 border border-red-700 rounded p-3 mb-3">
              <p className="text-xs text-red-300">
                <strong>Uyarı:</strong> Rapor oluşturulduğunda seçilen ayın tüm verileri (para girişleri, 
                giderler, sevkiyatlar, stok girişleri) silinecek ve sadece rapor olarak saklanacaktır. 
                Bu işlem geri alınamaz!
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#555555] mb-1">Yıl</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) =>
                    setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  min="2000"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#555555] mb-1">Ay</label>
                <select
                  value={formData.month}
                  onChange={(e) =>
                    setFormData({ ...formData, month: parseInt(e.target.value) || 1 })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {getMonthName(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-sm transition-colors"
              >
                {submitting ? "Oluşturuluyor..." : "Rapor Oluştur ve Verileri Sıfırla"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rapor Listesi */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">Oluşturulan Raporlar</h2>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : reports.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz rapor oluşturulmamış</p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-3 bg-white rounded-xl border border-[#E5E5E5]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {getMonthName(report.month)} {report.year}
                    </div>
                    <div className="text-xs text-[#222222] mt-1">
                      Oluşturulma: {new Date(report.report_date).toLocaleDateString("tr-TR")}
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                      <div>
                        <span className="text-[#222222]">Ciro:</span>{" "}
                        <span className="text-emerald-400 font-semibold">
                          {report.total_revenue.toFixed(2)} TL
                        </span>
                      </div>
                      <div>
                        <span className="text-[#222222]">Giderler:</span>{" "}
                        <span className="text-red-400 font-semibold">
                          {report.total_expenses.toFixed(2)} TL
                        </span>
                      </div>
                      <div>
                        <span className="text-[#222222]">Sevkiyat:</span>{" "}
                        <span className="text-orange-400 font-semibold">
                          {report.total_shipments.toFixed(2)} TL
                        </span>
                      </div>
                      <div>
                        <span className="text-[#222222]">Net Kar:</span>{" "}
                        <span className={`font-semibold ${report.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {report.net_profit.toFixed(2)} TL
                        </span>
                      </div>
                    </div>
                  </div>
                    <button
                      onClick={() => handleViewReport(report.id)}
                      className="px-3 py-1.5 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors whitespace-nowrap ml-4 text-white"
                    >
                    Detayları Gör
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rapor Detay Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Rapor Detayı: {getMonthName(selectedReport.month)} {selectedReport.year}
              </h2>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-[#555555] hover:text-black"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-xl p-3 border border-[#E5E5E5]">
                <div className="text-xs text-[#222222] mb-1">Toplam Ciro</div>
                <div className="text-lg font-bold text-emerald-400">
                  {selectedReport.total_revenue.toFixed(2)} TL
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#E5E5E5]">
                <div className="text-xs text-[#222222] mb-1">Toplam Giderler</div>
                <div className="text-lg font-bold text-red-400">
                  {selectedReport.total_expenses.toFixed(2)} TL
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#E5E5E5]">
                <div className="text-xs text-[#222222] mb-1">Sevkiyat Maliyeti</div>
                <div className="text-lg font-bold text-orange-400">
                  {selectedReport.total_shipments.toFixed(2)} TL
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#E5E5E5]">
                <div className="text-xs text-[#222222] mb-1">Net Kar/Zarar</div>
                <div className={`text-lg font-bold ${selectedReport.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {selectedReport.net_profit.toFixed(2)} TL
                </div>
              </div>
            </div>

            {selectedReport.report_data ? (
              <div className="space-y-4">
                {selectedReport.report_data.cash_movements && Array.isArray(selectedReport.report_data.cash_movements) && selectedReport.report_data.cash_movements.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Para Girişleri ({selectedReport.report_data.cash_movements.length})</h3>
                    <div className="bg-white rounded-xl p-3 text-xs max-h-40 overflow-y-auto border border-[#E5E5E5]">
                      {selectedReport.report_data.cash_movements.map((cm: any, idx: number) => (
                        <div key={idx} className="flex justify-between py-1 border-b border-slate-700">
                          <span>{new Date(cm.date).toLocaleDateString("tr-TR")} - {cm.method || "Nakit"}</span>
                          <span className="text-emerald-400">{Number(cm.amount || 0).toFixed(2)} TL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedReport.report_data.expenses && Array.isArray(selectedReport.report_data.expenses) && selectedReport.report_data.expenses.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Giderler ({selectedReport.report_data.expenses.length})</h3>
                    <div className="bg-white rounded-xl p-3 text-xs max-h-40 overflow-y-auto border border-[#E5E5E5]">
                      {selectedReport.report_data.expenses.map((exp: any, idx: number) => (
                        <div key={idx} className="flex justify-between py-1 border-b border-slate-700">
                          <span>{new Date(exp.date).toLocaleDateString("tr-TR")} - {exp.description || "Gider"}</span>
                          <span className="text-red-400">{Number(exp.amount || 0).toFixed(2)} TL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedReport.report_data.shipments && Array.isArray(selectedReport.report_data.shipments) && selectedReport.report_data.shipments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Sevkiyatlar ({selectedReport.report_data.shipments.length})</h3>
                    <div className="bg-white rounded-xl p-3 text-xs max-h-40 overflow-y-auto border border-[#E5E5E5]">
                      {selectedReport.report_data.shipments.map((sh: any, idx: number) => (
                        <div key={idx} className="flex justify-between py-1 border-b border-slate-700">
                          <span>{new Date(sh.date).toLocaleDateString("tr-TR")}</span>
                          <span className="text-orange-400">{Number(sh.total_amount || 0).toFixed(2)} TL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!selectedReport.report_data.cash_movements || selectedReport.report_data.cash_movements.length === 0) &&
                 (!selectedReport.report_data.expenses || selectedReport.report_data.expenses.length === 0) &&
                 (!selectedReport.report_data.shipments || selectedReport.report_data.shipments.length === 0) && (
                  <div className="text-center py-8 text-[#222222] text-sm">
                    Bu raporda detaylı veri bulunmamaktadır.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-[#222222] text-sm">
                Rapor verisi bulunamadı.
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-700">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

