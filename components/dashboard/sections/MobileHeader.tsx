"use client";
import type { DashboardModel } from "@/hooks/useDashboard";
import { Menu, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Mark360 } from "@/components/dashboard/shared/Mark360";
// Importing master data is desktop-only, so the phone header has no upload button.
export function MobileHeader({
  menuOpen,
  setMenuOpen,
}: Pick<DashboardModel, "menuOpen" | "setMenuOpen">) {
  return (
    <>
      <header className="mobile-header">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        {/* The bar is black in both themes, so it always takes the white-lettered logo. */}
        <strong className="mobile-brand" aria-label={BRAND.product}>
          <img src="/brand/tero-digital-dark.png" alt="" />
          <span className="brand-sub">
            <Mark360 />
            {BRAND.productWord}
          </span>
        </strong>
        <span className="mobile-header-spacer" />
      </header>
    </>
  );
}
