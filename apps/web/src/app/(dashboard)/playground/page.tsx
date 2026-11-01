"use client";

import React from "react";

import { StepPlaygroundTest } from "@/components/onboarding/step-playground-test";
import { useTenant } from "@/components/layout/tenant-context";

export default function PlaygroundPage(): React.ReactElement {
  const { currentBusinessId } = useTenant();

  if (!currentBusinessId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a business to test the AI as a customer.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6" data-slot="playground-page">
      <StepPlaygroundTest businessId={currentBusinessId} standalone />
    </div>
  );
}
