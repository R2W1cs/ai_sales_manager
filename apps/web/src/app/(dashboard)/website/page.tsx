"use client";

import React from "react";

import { useTenant } from "@/components/layout/tenant-context";
import { WebsiteInstallPanel } from "@/components/website/website-install-panel";

export default function WebsitePage(): React.ReactElement {
  const { currentBusinessId } = useTenant();

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <WebsiteInstallPanel businessId={currentBusinessId} />
    </div>
  );
}
