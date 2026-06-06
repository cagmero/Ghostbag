"use client";

import { useState } from "react";
import { TabNavigation, TabPanel, type TabId } from "@/components/TabNavigation";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("positions");

  return (
    <div className="container mx-auto max-w-screen-xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Ghostbag Treasury
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confidential treasury management with encrypted payments and
          homomorphic risk analytics.
        </p>
      </div>

      <div className="space-y-4">
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        <TabPanel activeTab={activeTab} />
      </div>
    </div>
  );
}
