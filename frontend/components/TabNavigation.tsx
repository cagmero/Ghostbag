"use client";

import { useState } from "react";
import { useWalletState } from "@/components/WalletConnector";
import { PositionsTab } from "@/components/PositionsTab";
import { RiskDashboardTab } from "@/components/RiskDashboardTab";
import { GhostPayTab } from "@/components/GhostPayTab";
import { AuditorViewTab } from "@/components/AuditorViewTab";

const TABS = [
  { id: "positions", label: "Positions" },
  { id: "ghostpay", label: "GhostPay" },
  { id: "risk", label: "Risk Dashboard" },
  { id: "auditor", label: "Auditor View" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { isConnected, isCorrectNetwork } = useWalletState();
  const disabled = !isConnected || !isCorrectNetwork;

  return (
    <nav className="flex gap-1 rounded-lg border border-border/40 bg-secondary/50 p-1">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            disabled={disabled}
            onClick={() => onTabChange(tab.id)}
            className={`
              rounded-md px-4 py-2 text-sm font-medium transition-colors
              ${
                disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }
            `}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

interface TabPanelProps {
  activeTab: TabId;
}

export function TabPanel({ activeTab }: TabPanelProps) {
  const { isConnected, isCorrectNetwork } = useWalletState();
  const disabled = !isConnected || !isCorrectNetwork;

  if (disabled) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-8 text-center backdrop-blur-sm">
        <p className="text-muted-foreground">
          {!isConnected
            ? "Connect your wallet to access Ghostbag features."
            : "Please switch to Ethereum Sepolia to continue."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-6 backdrop-blur-sm">
      {activeTab === "positions" && <PositionsTab />}
      {activeTab === "ghostpay" && <GhostPayTab />}
      {activeTab === "risk" && <RiskDashboardTab />}
      {activeTab === "auditor" && <AuditorViewTab />}
    </div>
  );
}
