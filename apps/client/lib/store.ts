import { create } from "zustand";
import { api } from "./api";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role?: "owner" | "admin" | "member";
}

interface AppState {
  user: User | null;
  organizations: Organization[];
  selectedOrgId: string | null;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setSelectedOrgId: (id: string | null) => void;
  fetchUser: () => Promise<void>;
  fetchOrganizations: () => Promise<void>;
  logout: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  organizations: [],
  selectedOrgId: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  setOrganizations: (orgs) => set({ organizations: orgs }),
  setSelectedOrgId: (id) => {
    if (typeof window !== "undefined" && id) {
      localStorage.setItem("selectedOrgId", id);
    }
    set({ selectedOrgId: id });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("selectedOrgId");
    }
    set({ user: null, organizations: [], selectedOrgId: null });
  },

  fetchUser: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get("/auth/me");
      // API returns { data: { user: { id, firstName, lastName, email, ... } } }
      const raw = res?.data?.user ?? res?.user ?? res?.data ?? res;
      const user: User = {
        id: raw.id,
        name: `${raw.firstName ?? ""} ${raw.lastName ?? ""}`.trim() || raw.name || raw.email,
        email: raw.email,
      };
      set({ user, isLoading: false });
    } catch (error: any) {
      console.error("Failed to fetch user:", error);
      set({ error: error.message || "Failed to fetch user", isLoading: false });
      get().logout(); // Clear invalid token
      throw error;
    }
  },

  fetchOrganizations: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/organizations");
      const rawOrgs = Array.isArray(response) ? response : response.data || [];

      const orgs = rawOrgs.map((item: any) => ({
        ...(item.org || item), // Map item.org if it exists, otherwise use item directly
        role: item.role || "owner",
      }));

      set((state) => {
        let newSelectedId = state.selectedOrgId;

        // Try to load selectedOrgId from local storage
        if (!newSelectedId && typeof window !== "undefined") {
          newSelectedId = localStorage.getItem("selectedOrgId");
        }

        // If not found or invalid, pick the first org
        if (
          !newSelectedId ||
          !orgs.find((o: Organization) => o.id === newSelectedId)
        ) {
          newSelectedId = orgs.length > 0 ? orgs[0].id : null;
        }

        if (typeof window !== "undefined" && newSelectedId) {
          localStorage.setItem("selectedOrgId", newSelectedId);
        }

        return {
          organizations: orgs,
          selectedOrgId: newSelectedId,
          isLoading: false,
        };
      });
    } catch (error: any) {
      console.error("Failed to fetch organizations:", error);
      set({
        error: error.message || "Failed to fetch organizations",
        isLoading: false,
      });
    }
  },
}));
