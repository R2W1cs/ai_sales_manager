"use client";

import { GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { Stack } from "@/components/ui/stack";
import { Wrapper } from "@/components/ui/wrapper";

export default function PipelinePage(): React.ReactElement {
  const t = useTranslations("pipeline");

  return (
    <Wrapper gap="md" className="h-full flex-1 overflow-y-auto bg-background p-4 md:p-6">
      {/* Page Header */}
      <Stack direction="column" size="xs" className="border-b border-border/60 pb-4">
        <Stack direction="row" size="sm">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GitBranch className="size-4.5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        </Stack>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </Stack>

      {/* Main Kanban Board Interface */}
      <div className="min-h-0 flex-1">
        <PipelineBoard />
      </div>
    </Wrapper>
  );
}
