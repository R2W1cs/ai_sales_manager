import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

describe("Members + invitations management (`/businesses/:id/members`, `/invitations`) (T-BIZ-03)", () => {
  let controller: MembersController;
  let service: MembersService;
  let prismaMock: {
    $transaction: jest.Mock;
    businessMember: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    invitation: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    idempotencyKey: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    subscription: {
      findFirst: jest.Mock;
    };
    role: {
      findFirst: jest.Mock;
    };
    conversationAssignment: {
      updateMany: jest.Mock;
    };
    organization: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    member: {
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const businessId = "11111111-1111-1111-1111-111111111111";
  const userId = "22222222-2222-2222-2222-222222222222";
  const targetUserId = "33333333-3333-3333-3333-333333333333";
  const adminRoleId = "role-admin-id";

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(
        async (
          callback: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[],
        ): Promise<unknown> => {
          if (typeof callback === "function") {
            return callback(prismaMock);
          }
          return Promise.all(callback);
        },
      ),
      businessMember: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      invitation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      idempotencyKey: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      conversationAssignment: {
        updateMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: businessId, name: "Test Org" }),
        create: jest.fn().mockResolvedValue({ id: businessId, name: "Test Org" }),
      },
      member: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new MembersService(prismaMock as unknown as PrismaClient);
    controller = new MembersController(service);
  });

  it("Team Invite: Owner invites Manager; returns invitation token.", async () => {
    prismaMock.businessMember.findFirst.mockResolvedValue(null); // Not already a member
    prismaMock.businessMember.count.mockResolvedValue(1); // 1 active member (owner)
    prismaMock.invitation.count.mockResolvedValue(0); // 0 pending invites
    prismaMock.subscription.findFirst.mockResolvedValue({
      business_id: businessId,
      status: "active",
      plan: {
        limits: {
          seats: 5,
        },
      },
    });
    prismaMock.role.findFirst.mockResolvedValue({
      id: adminRoleId,
      name: "admin",
    });

    const fakeTokenHash = "mocked-hash";
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const createdAt = new Date();

    prismaMock.invitation.upsert.mockResolvedValue({
      id: "invite-123",
      business_id: businessId,
      organizationId: businessId,
      email: "manager@example.com",
      role_id: adminRoleId,
      invited_by_user_id: userId,
      inviterId: userId,
      token_hash: fakeTokenHash,
      expiresAt,
      createdAt,
      updatedAt: createdAt,
      status: "pending",
      accepted_at: null,
      role: "admin",
      role_rel: { name: "admin" },
    } as any);

    const user = { id: userId, sub: userId };
    const result = await controller.createInvitation(
      businessId,
      businessId,
      user,
      {
        email: "manager@example.com",
        role: "MANAGER" as any,
      },
      "idempotency-key-123",
    );

    expect(prismaMock.invitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          business_id_email: {
            business_id: businessId,
            email: "manager@example.com",
          },
        },
        create: expect.objectContaining({
          business_id: businessId,
          email: "manager@example.com",
          role_id: adminRoleId,
          invited_by_user_id: userId,
        }),
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: "invite-123",
        businessId,
        email: "manager@example.com",
        role: "admin",
        invitedByUserId: userId,
        token: expect.any(String),
      }),
    );
  });

  it("Idempotency-Key Required (400): Missing Idempotency-Key header on invitation creation returns 400 validation_error.", async () => {
    const user = { id: userId, sub: userId };

    await expect(
      controller.createInvitation(
        businessId,
        businessId,
        user,
        {
          email: "manager@example.com",
          role: "admin",
        },
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.invitation.upsert).not.toHaveBeenCalled();
  });

  it("Forbid Owner Invite (400): Attempting to invite role `OWNER` returns 400 Bad Request.", async () => {
    const user = { id: userId, sub: userId };

    await expect(
      controller.createInvitation(
        businessId,
        businessId,
        user,
        {
          email: "newowner@example.com",
          role: "OWNER" as any,
        },
        "idempotency-key-456",
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.invitation.upsert).not.toHaveBeenCalled();
  });

  it("Sole Owner Protection (403): Demoting or removing sole Owner returns 403 Forbidden.", async () => {
    // 1. Attempting to demote sole Owner
    prismaMock.businessMember.findFirst.mockResolvedValue({
      id: "membership-owner-1",
      business_id: businessId,
      user_id: targetUserId,
      role: { name: "owner" },
      user: { name: "Sole Owner", email: "owner@example.com" },
    });

    prismaMock.businessMember.count.mockResolvedValue(1); // Exactly 1 owner

    await expect(
      controller.updateMemberRole(businessId, businessId, targetUserId, { role: "employee" }),
    ).rejects.toThrow(ForbiddenException);

    // 2. Attempting to remove sole Owner
    await expect(controller.removeMember(businessId, businessId, targetUserId)).rejects.toThrow(
      ForbiddenException,
    );

    expect(prismaMock.businessMember.update).not.toHaveBeenCalled();
  });

  it("Quota Enforcement (403): Exceeding plan seat limit returns 403 quota_exceeded.", async () => {
    prismaMock.businessMember.findFirst.mockResolvedValue(null);
    prismaMock.businessMember.count.mockResolvedValue(1); // 1 active member
    prismaMock.invitation.count.mockResolvedValue(0); // 0 pending invites
    prismaMock.subscription.findFirst.mockResolvedValue({
      business_id: businessId,
      status: "active",
      plan: {
        limits: {
          seats: 1, // Max 1 seat!
        },
      },
    });

    const user = { id: userId, sub: userId };

    await expect(
      controller.createInvitation(
        businessId,
        businessId,
        user,
        {
          email: "extra@example.com",
          role: "employee",
        },
        "idempotency-key-789",
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prismaMock.invitation.upsert).not.toHaveBeenCalled();
  });

  it("List Members: Returns active members formatted per contract.", async () => {
    const joinedAt = new Date();
    prismaMock.businessMember.findMany.mockResolvedValue([
      {
        id: "mem-1",
        business_id: businessId,
        user_id: userId,
        joined_at: joinedAt,
        invited_at: null,
        last_active_at: null,
        user: { name: "Alice", email: "alice@example.com" },
        role: { name: "owner" },
      },
    ]);

    const result = await controller.listMembers(businessId, businessId);

    expect(result).toEqual([
      {
        id: "mem-1",
        userId,
        businessId,
        name: "Alice",
        email: "alice@example.com",
        role: "owner",
        joinedAt,
        invitedAt: null,
        lastActiveAt: null,
      },
    ]);
  });

  it("List Pending Invitations: Returns pending invitations formatted per contract.", async () => {
    const expiresAt = new Date(Date.now() + 86400000);
    const createdAt = new Date();
    prismaMock.invitation.findMany.mockResolvedValue([
      {
        id: "invite-1",
        business_id: businessId,
        organizationId: businessId,
        email: "pending@example.com",
        role_id: adminRoleId,
        invited_by_user_id: userId,
        inviterId: userId,
        token_hash: "hash",
        expiresAt,
        createdAt,
        updatedAt: createdAt,
        status: "pending",
        accepted_at: null,
        role: "admin",
        role_rel: { name: "admin" },
      } as any,
    ]);

    const result = await controller.listInvitations(businessId, businessId);

    expect(result).toEqual([
      {
        id: "invite-1",
        businessId,
        email: "pending@example.com",
        role: "admin",
        invitedByUserId: userId,
        expiresAt,
        createdAt,
      },
    ]);
  });

  it("Revoke Invitation (204): Revokes pending invitation.", async () => {
    prismaMock.invitation.findFirst.mockResolvedValue({
      id: "invite-1",
      business_id: businessId,
    });
    prismaMock.invitation.delete.mockResolvedValue({});

    await controller.revokeInvitation(businessId, businessId, "invite-1");

    expect(prismaMock.invitation.delete).toHaveBeenCalledWith({
      where: { id: "invite-1" },
    });
  });

  it("RBAC Rigor: Endpoints are guarded with members.manage.", () => {
    /* oxlint-disable typescript/unbound-method */
    const listInvitationsPerm = Reflect.getMetadata(
      "permissions",
      MembersController.prototype.listInvitations,
    );
    const createInvitePerm = Reflect.getMetadata(
      "permissions",
      MembersController.prototype.createInvitation,
    );
    const revokeInvitePerm = Reflect.getMetadata(
      "permissions",
      MembersController.prototype.revokeInvitation,
    );
    const updateRolePerm = Reflect.getMetadata(
      "permissions",
      MembersController.prototype.updateMemberRole,
    );
    const removeMemberPerm = Reflect.getMetadata(
      "permissions",
      MembersController.prototype.removeMember,
    );
    /* oxlint-enable typescript/unbound-method */

    expect(listInvitationsPerm).toEqual(["members.manage"]);
    expect(createInvitePerm).toEqual(["members.manage"]);
    expect(revokeInvitePerm).toEqual(["members.manage"]);
    expect(updateRolePerm).toEqual(["members.manage"]);
    expect(removeMemberPerm).toEqual(["members.manage"]);
  });
});
