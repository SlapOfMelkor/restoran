import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../api/client";

export type UserRole = "super_admin" | "branch_admin";

export interface Branch {
  id: number;
  name: string;
  address: string;
  phone?: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  branch_id: number | null;
  branch?: Branch;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  selectedBranchId: number | null; // Super admin için seçili şube
  setSelectedBranchId: (branchId: number | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth_token"));
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    () => {
      const saved = localStorage.getItem("selected_branch_id");
      return saved ? parseInt(saved, 10) : null;
    }
  );

  // Token varsa backend'den /auth/me ile kullanıcı bilgisini çek
  useEffect(() => {
    const fetchMe = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await apiClient.get("/auth/me");
        const data = res.data;
        // /auth/me artık { user_id, name, email, role, branch_id, branch } döndürüyor
        const authUser: AuthUser = {
          id: data.user_id ?? 0,
          name: data.name ?? "",
          email: data.email ?? "",
          role: data.role,
          branch_id: data.branch_id ?? null,
          branch: data.branch ? {
            id: data.branch.id,
            name: data.branch.name,
            address: data.branch.address,
            phone: data.branch.phone,
          } : undefined,
        };
        setUser(authUser);
      } catch (err) {
        console.error("AUTH /auth/me error:", err);
        setUser(null);
        setToken(null);
        localStorage.removeItem("auth_token");
      } finally {
        setLoading(false);
      }
    };

    fetchMe();
  }, [token]);

  const login = async (email: string, password: string) => {
    // Login endpoint'inin dönme şeklinden bağımsız çalışalım:
    const res = await apiClient.post("/auth/login", { email, password });
    const data = res.data;

    // Token field ismi token veya access_token olabilir
    const jwt: string | undefined = data.token || data.access_token;

    if (!jwt) {
      console.error("Login response data:", data);
      throw new Error("Sunucudan token alınamadı");
    }

    localStorage.setItem("auth_token", jwt);
    setToken(jwt);

    // Kullanıcı bilgisi login cevabında varsa hemen set edelim, yoksa /auth/me halleder
    if (data.user) {
      const u = data.user;
      const authUser: AuthUser = {
        id: u.id,
        name: u.name ?? "",
        email: u.email ?? "",
        role: u.role,
        branch_id: u.branch_id ?? null,
      };
      setUser(authUser);
    } else {
      // Bir dahaki render'da useEffect -> /auth/me çağırıp user'ı dolduracak
      setUser(null);
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("selected_branch_id");
    setToken(null);
    setUser(null);
    setSelectedBranchId(null);
  };

  const handleSetSelectedBranchId = (branchId: number | null) => {
    setSelectedBranchId(branchId);
    if (branchId) {
      localStorage.setItem("selected_branch_id", branchId.toString());
    } else {
      localStorage.removeItem("selected_branch_id");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        selectedBranchId,
        setSelectedBranchId: handleSetSelectedBranchId,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
