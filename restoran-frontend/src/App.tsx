import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MobileLayout } from "./components/Layout/MobileLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { CashPage } from "./pages/CashPage";
import { CenterShipmentsPage } from "./pages/CenterShipmentsPage";
import { ShipmentsPage } from "./pages/ShipmentsPage";
import { StockPage } from "./pages/StockPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { FinancialSummaryPage } from "./pages/FinancialSummaryPage";
import { AdminManagementPage } from "./pages/AdminManagementPage";
import { BranchesPage } from "./pages/BranchesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { BankStatusPage } from "./pages/BankStatusPage";
import { MonthlyReportsPage } from "./pages/MonthlyReportsPage";
import { WastePage } from "./pages/WastePage";

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <DashboardPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/cash"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CashPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/center-shipments"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <CenterShipmentsPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/shipments"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <ShipmentsPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/stock"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <StockPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <ExpensesPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/financial-summary"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <FinancialSummaryPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-management"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <AdminManagementPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/branches"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <BranchesPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/products"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <ProductsPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/bank-status"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <BankStatusPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/monthly-reports"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <MonthlyReportsPage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waste"
        element={
          <ProtectedRoute>
            <MobileLayout>
              <WastePage />
            </MobileLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
