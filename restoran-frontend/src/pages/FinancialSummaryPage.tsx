import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface DailyRevenue {
  date: string;
  revenue: number;
  expenses: number;
  shipment_costs: number;
}

interface FinancialSummary {
  period: "daily" | "weekly" | "monthly";
  start_date: string;
  end_date: string;
  total_revenue: number;
  total_expenses: number;
  shipment_costs: number;
  credit_card_debt?: number;
  bank_balance?: number;
  net_profit: number;
  daily_breakdown?: DailyRevenue[];
}

export const FinancialSummaryPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [viewMode, setViewMode] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Günlük için tarih aralığı
  const [dailyRange, setDailyRange] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  // Haftalık için yıl ve hafta
  const [weeklyData, setWeeklyData] = useState({
    year: new Date().getFullYear(),
    week: Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)),
  });

  // Aylık için yıl ve ay
  const [monthlyData, setMonthlyData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }

      let endpoint = "";
      if (viewMode === "daily") {
        endpoint = "/financial-summary/daily";
        params.from = dailyRange.from;
        params.to = dailyRange.to;
      } else if (viewMode === "weekly") {
        endpoint = "/financial-summary/weekly";
        params.year = weeklyData.year;
        params.week = weeklyData.week;
      } else {
        endpoint = "/financial-summary/monthly-new";
        params.year = monthlyData.year;
        params.month = monthlyData.month;
      }

      const res = await apiClient.get(endpoint, { params });
      setSummary(res.data);
    } catch (err: any) {
      console.error("Finansal özet yüklenemedi:", err);
      alert(err.response?.data?.error || "Finansal özet yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [viewMode, dailyRange, weeklyData, monthlyData, user, selectedBranchId]);

  const getWeekOptions = () => {
    const weeks = [];
    for (let i = 1; i <= 53; i++) {
      weeks.push(i);
    }
    return weeks;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Günlük, haftalık ve aylık ciro, giderler ve net kar/zarar bilgileri
        </p>
      </div>

      {/* Görünüm Seçimi */}
      <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setViewMode("daily")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === "daily"
                ? "bg-[#8F1A9F] text-white"
                : "bg-white text-[#8F1A9F] border border-[#E5E5E5]"
            }`}
          >
            Günlük
          </button>
          <button
            onClick={() => setViewMode("weekly")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === "weekly"
                ? "bg-[#8F1A9F] text-white"
                : "bg-white text-[#8F1A9F] border border-[#E5E5E5]"
            }`}
          >
            Haftalık
          </button>
          <button
            onClick={() => setViewMode("monthly")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === "monthly"
                ? "bg-[#8F1A9F] text-white"
                : "bg-white text-[#8F1A9F] border border-[#E5E5E5]"
            }`}
          >
            Aylık
          </button>
        </div>

        {/* Filtreler */}
        {viewMode === "daily" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#222222] mb-1">Başlangıç Tarihi</label>
              <input
                type="date"
                value={dailyRange.from || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split("T")[0]}
                onChange={(e) => setDailyRange({ ...dailyRange, from: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#222222] mb-1">Bitiş Tarihi</label>
              <input
                type="date"
                value={dailyRange.to || new Date().toISOString().split("T")[0]}
                onChange={(e) => setDailyRange({ ...dailyRange, to: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              />
            </div>
          </div>
        )}

        {viewMode === "weekly" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#222222] mb-1">Yıl</label>
              <input
                type="number"
                value={weeklyData.year}
                onChange={(e) => setWeeklyData({ ...weeklyData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#222222] mb-1">Hafta</label>
              <select
                value={weeklyData.week}
                onChange={(e) => setWeeklyData({ ...weeklyData, week: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              >
                {getWeekOptions().map((w) => (
                  <option key={w} value={w}>
                    {w}. Hafta
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {viewMode === "monthly" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#222222] mb-1">Yıl</label>
              <input
                type="number"
                value={monthlyData.year}
                onChange={(e) => setMonthlyData({ ...monthlyData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#222222] mb-1">Ay</label>
              <select
                value={monthlyData.month}
                onChange={(e) => setMonthlyData({ ...monthlyData, month: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Özet Kartları */}
      {loading ? (
        <p className="text-xs text-[#222222]">Yükleniyor...</p>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
              <div className="text-xs text-[#222222] mb-1">Toplam Para Girişi</div>
              <div className="text-lg font-bold text-emerald-400">
                {summary.total_revenue.toFixed(2)} TL
              </div>
            </div>
            <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
              <div className="text-xs text-[#222222] mb-1">Toplam Giderler</div>
              <div className="text-lg font-bold text-red-400">
                {summary.total_expenses.toFixed(2)} TL
              </div>
            </div>
            <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
              <div className="text-xs text-[#222222] mb-1">Sevkiyat Maliyeti</div>
              <div className="text-lg font-bold text-orange-400">
                {summary.shipment_costs.toFixed(2)} TL
              </div>
            </div>
            {summary.credit_card_debt !== undefined && (
              <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
                <div className="text-xs text-[#222222] mb-1">Kredi Kartı Borçları</div>
                <div className="text-lg font-bold text-red-500">
                  {summary.credit_card_debt.toFixed(2)} TL
                </div>
              </div>
            )}
            {summary.bank_balance !== undefined && (
              <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
                <div className="text-xs text-[#222222] mb-1">Banka Hesapları Bakiyesi</div>
                <div className={`text-lg font-bold ${summary.bank_balance >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {summary.bank_balance.toFixed(2)} TL
                </div>
              </div>
            )}
            <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
              <div className="text-xs text-[#222222] mb-1">Net Kar/Zarar</div>
              <div className={`text-lg font-bold ${summary.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {summary.net_profit.toFixed(2)} TL
              </div>
            </div>
          </div>

          {/* Günlük Detay (daily ve weekly için) */}
          {summary.daily_breakdown && summary.daily_breakdown.length > 0 && (
            <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
              <h2 className="text-sm font-semibold mb-3 text-[#8F1A9F]">Günlük Detay</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-2">Tarih</th>
                      <th className="text-right p-2">Ciro</th>
                      <th className="text-right p-2">Giderler</th>
                      <th className="text-right p-2">Sevkiyat</th>
                      <th className="text-right p-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.daily_breakdown.map((day) => (
                      <tr key={day.date} className="border-b border-slate-800">
                        <td className="p-2">{day.date}</td>
                        <td className="text-right p-2 text-emerald-400">
                          {day.revenue.toFixed(2)} TL
                        </td>
                        <td className="text-right p-2 text-red-400">
                          {day.expenses.toFixed(2)} TL
                        </td>
                        <td className="text-right p-2 text-orange-400">
                          {day.shipment_costs.toFixed(2)} TL
                        </td>
                        <td className={`text-right p-2 font-semibold ${(day.revenue - day.expenses - day.shipment_costs) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(day.revenue - day.expenses - day.shipment_costs).toFixed(2)} TL
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
            <div className="text-xs text-[#555555]">
              Dönem: {summary.start_date} - {summary.end_date}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#222222]">Veri bulunamadı</p>
      )}
    </div>
  );
};
