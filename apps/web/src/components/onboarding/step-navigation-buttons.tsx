"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";

import { Button } from "@/components/ui/button";

export interface StepNavigationButtonsProps {
  onPrev?: () => void;
  onNext?: () => void;
  isNextDisabled?: boolean;
  isPrevDisabled?: boolean;
  nextLabel?: string;
  prevLabel?: string;
  nextType?: "button" | "submit";
}

export function StepNavigationButtons({
  onPrev,
  onNext,
  isNextDisabled,
  isPrevDisabled,
  nextLabel,
  prevLabel,
  nextType = "button",
}: StepNavigationButtonsProps): React.ReactElement {
  const tCommon = useTranslations("common");

  return (
    <div className="flex items-center justify-between pt-4">
      {onPrev ? (
        <Button
          type="button"
          variant="outline"
          onClick={onPrev}
          disabled={isPrevDisabled}
          data-slot="btn-prev-step"
          className="gap-2"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
          <span>{prevLabel || tCommon("back")}</span>
        </Button>
      ) : (
        <div />
      )}

      {onNext && (
        <Button
          type={nextType}
          onClick={nextType === "button" ? onNext : undefined}
          disabled={isNextDisabled}
          data-slot="btn-next-step"
          className="gap-2"
        >
          <span>{nextLabel || tCommon("next")}</span>
          <ArrowRight className="size-4 rtl:rotate-180" />
        </Button>
      )}
    </div>
  );
}
