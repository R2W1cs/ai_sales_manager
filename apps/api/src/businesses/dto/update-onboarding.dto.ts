import { z } from "zod";

/**
 * 13 §5 PATCH /api/v1/businesses/:id/onboarding Request Schema
 * Only handoffAcknowledged (G5) and optional currentStep are client-writable.
 * Strictly forbids setting aiActivated, channelConnected, or other system-computed flags.
 */
export const UpdateOnboardingSchema = z.strictObject({
  handoffAcknowledged: z.boolean().optional(),
  currentStep: z.number().int().min(1).max(6).optional(),
});

export type UpdateOnboardingDto = z.infer<typeof UpdateOnboardingSchema>;

export type ActivationGateId = "G1" | "G2" | "G3" | "G4" | "G5";

export interface OnboardingStateResponse {
  businessId: string;
  businessCreated: boolean;
  channelConnected: boolean;
  productsImported: boolean;
  aiConfigured: boolean;
  playgroundPassed: boolean;
  approvalTrialPassed: boolean;
  handoffAcknowledged: boolean;
  aiActivated: boolean;
  currentStep: number;
  completedSteps: string[];
  isReadyForLive: boolean;
  aiActivationReady: boolean;
  unmetGates: ActivationGateId[];
}
