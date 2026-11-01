import { Injectable } from "@nestjs/common";

import { REALTIME_EVENTS, REALTIME_ROOMS } from "@app/shared";

import { RealtimeGateway } from "./realtime.gateway";

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  /**
   * Emit raw event to tenant room.
   */
  emitToTenant(businessId: string, event: string, payload: unknown): void {
    this.gateway.emitToTenant(businessId, event, payload);
  }

  /**
   * Emit raw event to user room.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.gateway.emitToUser(userId, event, payload);
  }

  /**
   * Emit raw event to conversation room.
   */
  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.gateway.emitToConversation(conversationId, event, payload);
  }

  /**
   * Emit new message event to tenant and active conversation room.
   */
  emitMessageNew(businessId: string, conversationId: string, message: unknown): void {
    const payload = { conversationId, message };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.MESSAGE_NEW, payload);
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_MESSAGE, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.MESSAGE_NEW, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.CONVERSATION_MESSAGE, payload);
  }

  /**
   * Emit message updated event (e.g. delivery status update).
   */
  emitMessageUpdated(businessId: string, conversationId: string, message: unknown): void {
    const payload = { conversationId, message };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.MESSAGE_UPDATED, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.MESSAGE_UPDATED, payload);
  }

  /**
   * Emit conversation status change event (e.g. AI_ACTIVE -> HUMAN_REQUIRED).
   */
  emitConversationStatusChanged(
    businessId: string,
    conversationId: string,
    status: string,
    extra?: Record<string, unknown>,
  ): void {
    const payload = { conversationId, status, ...extra };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED, payload);
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_STATUS, payload);
    this.gateway.emitToConversation(
      conversationId,
      REALTIME_EVENTS.CONVERSATION_STATUS_CHANGED,
      payload,
    );
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.CONVERSATION_STATUS, payload);
  }

  /**
   * Emit conversation assignment update event.
   */
  emitConversationAssigned(
    businessId: string,
    conversationId: string,
    assignedUserId: string | null,
  ): void {
    const payload = { conversationId, assignedUserId };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_ASSIGNED, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.CONVERSATION_ASSIGNED, payload);
  }

  /**
   * Emit lead score / temperature recomputation event.
   */
  emitLeadScoreUpdated(
    businessId: string,
    conversationId: string,
    score: number,
    temperature: string,
  ): void {
    const payload = { conversationId, score, temperature };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.LEAD_SCORE_UPDATED, payload);
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_SCORE, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.LEAD_SCORE_UPDATED, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.CONVERSATION_SCORE, payload);
  }

  /**
   * Emit conversation handoff event.
   */
  emitConversationHandoff(
    businessId: string,
    conversationId: string,
    details: Record<string, unknown>,
  ): void {
    const payload = { conversationId, ...details };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_HANDOFF, payload);
    this.gateway.emitToConversation(conversationId, REALTIME_EVENTS.CONVERSATION_HANDOFF, payload);
  }

  /**
   * Emit suggestion ready event.
   */
  emitConversationSuggestion(
    businessId: string,
    conversationId: string,
    suggestion: unknown,
  ): void {
    const payload = { conversationId, suggestion };
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.CONVERSATION_SUGGESTION, payload);
    this.gateway.emitToConversation(
      conversationId,
      REALTIME_EVENTS.CONVERSATION_SUGGESTION,
      payload,
    );
  }

  /**
   * Emit in-app notification event to user and tenant.
   */
  emitNotificationNew(businessId: string, userId: string, notification: unknown): void {
    const payload = { businessId, userId, notification };
    this.gateway.emitToUser(userId, REALTIME_EVENTS.NOTIFICATION_NEW, payload);
    this.gateway.emitToTenant(businessId, REALTIME_EVENTS.NOTIFICATION_NEW, payload);
  }

  /**
   * Disconnect all active sockets for a specific user (e.g. password reset / logout).
   */
  disconnectUserSockets(userId: string): void {
    this.gateway.disconnectSocketsInRoom(REALTIME_ROOMS.user(userId));
  }

  /**
   * Disconnect all active sockets for a tenant (e.g. business deletion).
   */
  disconnectBusinessSockets(businessId: string): void {
    this.gateway.disconnectSocketsInRoom(REALTIME_ROOMS.tenant(businessId));
    this.gateway.disconnectSocketsInRoom(REALTIME_ROOMS.business(businessId));
  }
}
