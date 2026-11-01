import { ErrorCodeSchema } from "@app/shared";

import { AppService } from "./app.service";

describe("AppService", () => {
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
  });

  it('should return "OK"', () => {
    expect(appService.getHello()).toBe("OK");
  });

  it("should be able to use shared ErrorCodeSchema", () => {
    expect(ErrorCodeSchema.parse("unauthorized")).toBe("unauthorized");
  });
});
