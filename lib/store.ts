"use client";

import { create } from "zustand";
import { writeCollapsedGroups } from "./nav";
import type {
  ConfirmOptions,
  FormModalOptions,
  PanelOptions,
  RecordBase,
  ToastTone,
} from "./types";

export interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
}

interface UIState {
  /* ---- Toasts ---- */
  toasts: ToastItem[];
  toast: (title: string, message?: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;

  /* ---- Confirmation modal ---- */
  confirmOpts: ConfirmOptions | null;
  confirm: (opts: ConfirmOptions) => void;
  closeConfirm: () => void;

  /* ---- Generic form modal (lot / serial / picker dialogs) ---- */
  formModalOpts: FormModalOptions | null;
  formModal: (opts: FormModalOptions) => void;
  closeFormModal: () => void;

  /* ---- Quick View drawer ---- */
  quickView: { entity: string; record: RecordBase } | null;
  openQuickView: (entity: string, record: RecordBase) => void;
  closeQuickView: () => void;

  /**
   * Generic block panel — the "View All Addresses / Contacts / Bank Accounts"
   * surface. Holds blocks rather than an entity, so any schema can raise one
   * without the host knowing what is inside.
   */
  panelOpts: PanelOptions | null;
  panel: (opts: PanelOptions) => void;
  closePanel: () => void;

  /* ---- Advanced filter drawer ---- */
  filterDrawerOpen: boolean;
  setFilterDrawer: (open: boolean) => void;

  /**
   * Trailing breadcrumb segment. Detail and form pages publish the record code
   * here so the topbar shows which record is open without prop-drilling
   * through the layout.
   */
  crumbCode: string | null;
  setCrumbCode: (code: string | null) => void;

  /* ---- Sidebar ---- */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;

  /**
   * Sidebar sections folded down to their heading, by label.
   *
   * Starts empty on both server and client so the first paint matches what
   * was rendered on the server; the Sidebar hydrates the stored preference
   * on mount. Every section open is also the honest default for someone who
   * has never touched this.
   */
  navCollapsed: string[];
  toggleNavGroup: (label: string) => void;
  /** Adopt the stored preference on mount. Does not write it back. */
  hydrateNavGroups: (labels: string[]) => void;

  /**
   * Mock data lives in plain module-level arrays. Mutating them cannot notify
   * React, so every write bumps this counter and the list/detail views read it
   * as a dependency. Swap for real cache invalidation when the API lands.
   */
  revision: number;
  refresh: () => void;
}

let toastSeq = 0;

export const useUI = create<UIState>((set, get) => ({
  toasts: [],
  toast: (title, message, tone = "success") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, title, message, tone }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirmOpts: null,
  confirm: (opts) => set({ confirmOpts: opts }),
  closeConfirm: () => set({ confirmOpts: null }),

  formModalOpts: null,
  formModal: (opts) => set({ formModalOpts: opts }),
  closeFormModal: () => set({ formModalOpts: null }),

  quickView: null,
  openQuickView: (entity, record) => set({ quickView: { entity, record } }),
  closeQuickView: () => set({ quickView: null }),

  panelOpts: null,
  panel: (opts) => set({ panelOpts: opts }),
  closePanel: () => set({ panelOpts: null }),

  filterDrawerOpen: false,
  setFilterDrawer: (open) => set({ filterDrawerOpen: open }),

  crumbCode: null,
  setCrumbCode: (code) => set({ crumbCode: code }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),

  navCollapsed: [],
  toggleNavGroup: (label) =>
    set((s) => {
      const next = s.navCollapsed.includes(label)
        ? s.navCollapsed.filter((l) => l !== label)
        : [...s.navCollapsed, label];
      writeCollapsedGroups(next);
      return { navCollapsed: next };
    }),
  hydrateNavGroups: (labels) => set({ navCollapsed: labels }),

  revision: 0,
  refresh: () => set((s) => ({ revision: s.revision + 1 })),
}));
