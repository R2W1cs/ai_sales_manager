"use client";

import React from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { PipelineColumnId } from "./pipeline-column";

export interface PipelineSkeletonGridProps {
  columns: PipelineColumnId[];
}

export function PipelineSkeletonGrid({ columns }: PipelineSkeletonGridProps): React.ReactElement {
  return (
    <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((colId) => (
        <div
          key={colId}
          className="flex h-full flex-col space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3.5"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-4 w-36" />
          <div className="space-y-2.5 pt-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
