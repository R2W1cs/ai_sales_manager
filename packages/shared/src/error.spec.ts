import { ErrorEnvelopeSchema } from "./error";

describe("ErrorEnvelopeSchema", () => {
  it("validates a correct error envelope", () => {
    const validEnvelope = {
      error: {
        code: "validation_error",
        message: "Invalid input",
        details: {
          fields: {
            email: ["Required"],
          },
        },
      },
      request_id: "550e8400-e29b-41d4-a716-446655440000",
    };

    expect(ErrorEnvelopeSchema.parse(validEnvelope)).toEqual(validEnvelope);
  });

  it("fails on invalid error code", () => {
    const invalidEnvelope = {
      error: {
        code: "invalid_code",
        message: "Some error",
      },
      request_id: "550e8400-e29b-41d4-a716-446655440000",
    };

    expect(() => ErrorEnvelopeSchema.parse(invalidEnvelope)).toThrow();
  });

  it("allows unknown keys in error details (loose object)", () => {
    const envelope = {
      error: {
        code: "validation_error",
        message: "Invalid input",
        details: {
          fields: { email: ["Required"] },
          extra_context: "debug",
        },
      },
      request_id: "550e8400-e29b-41d4-a716-446655440000",
    };

    expect(ErrorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("fails on invalid request_id (non-UUID)", () => {
    const invalidEnvelope = {
      error: {
        code: "unauthorized",
        message: "Unauthorized",
      },
      request_id: "not-a-uuid",
    };

    expect(() => ErrorEnvelopeSchema.parse(invalidEnvelope)).toThrow();
  });
});
