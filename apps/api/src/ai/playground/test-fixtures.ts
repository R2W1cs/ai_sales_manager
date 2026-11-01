export const TEST_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_CONVERSATION_ID = "33333333-3333-3333-3333-333333333333";
export const TEST_INBOUND_MSG_ID = "44444444-4444-4444-4444-444444444444";
export const TEST_OUTBOUND_MSG_ID = "55555555-5555-5555-5555-555555555555";

export interface MockPrismaClient {
  conversation: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  customer: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  message: {
    findFirst: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  idempotencyKey: {
    findUnique: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  aiDecisionTrace: {
    findFirst: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  aiUsage: {
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  aiAgent: {
    findUnique: jest.Mock;
  };
  aiSettings: {
    findUnique: jest.Mock;
  };
  businessRule: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  product: {
    findMany: jest.Mock;
  };
  productVariant: {
    findMany: jest.Mock;
  };
  orderItem: {
    findMany: jest.Mock;
  };
  aiAction: {
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  conversationStatusEvent: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findMany: jest.Mock;
  };
  businessOnboarding: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
}

export function createMockPrismaClient(): MockPrismaClient {
  return {
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    customer: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    message: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    aiDecisionTrace: {
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    aiUsage: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    aiAgent: {
      findUnique: jest.fn(),
    },
    aiSettings: {
      findUnique: jest.fn(),
    },
    businessRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    productVariant: {
      findMany: jest.fn(),
    },
    orderItem: {
      findMany: jest.fn(),
    },
    aiAction: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    conversationStatusEvent: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    businessOnboarding: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn().mockResolvedValue({
        business_id: TEST_BUSINESS_ID,
        business_created: true,
        playground_passed: true,
      }),
    },
  };
}
