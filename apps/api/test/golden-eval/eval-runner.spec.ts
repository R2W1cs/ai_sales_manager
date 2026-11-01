import * as fs from "fs";
import * as path from "path";

import { Test, type TestingModule } from "@nestjs/testing";

import {
  EvaluationService,
  DEFAULT_BENCHMARK_THRESHOLDS,
  resolveDefaultReportPath,
  type EvaluationDataset,
  type BenchmarkReport,
  type OrchestratorLike,
  type LiveTurnExecutor,
} from "../../src/ai/evaluation/evaluation.service";
import { GuardrailsService } from "../../src/ai/guardrails/guardrails.service";
import { IntentClassifierService } from "../../src/ai/intent/intent-classifier.service";

describe("Golden evaluation dataset & automated benchmark in CI (T-AI-09)", () => {
  let evalService: EvaluationService;
  let guardrailsService: GuardrailsService;
  let intentClassifier: IntentClassifierService;
  let dataset: EvaluationDataset;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [EvaluationService, GuardrailsService, IntentClassifierService],
    }).compile();

    evalService = moduleRef.get<EvaluationService>(EvaluationService);
    guardrailsService = moduleRef.get<GuardrailsService>(GuardrailsService);
    intentClassifier = moduleRef.get<IntentClassifierService>(IntentClassifierService);

    const datasetPath = path.join(__dirname, "dataset.json");
    const rawData = fs.readFileSync(datasetPath, "utf-8");
    dataset = JSON.parse(rawData) as EvaluationDataset;
  });

  it("Dataset Integrity: Contains 50-200 realistic Tunisian Derja/French dialogues with dialect diversity", () => {
    expect(dataset.scenarios.length).toBeGreaterThanOrEqual(100);
    expect(dataset.scenarios.length).toBeLessThanOrEqual(200);

    const arabiziCount = dataset.scenarios.filter((s) => s.language === "tunisian_arabizi").length;
    const arabicCount = dataset.scenarios.filter((s) => s.language === "tunisian_arabic").length;
    const frenchCount = dataset.scenarios.filter((s) => s.language === "french").length;
    const mixedCount = dataset.scenarios.filter((s) => s.language === "mixed").length;

    // Verify minimum dialect representation ratios (at N=100) per 02-rag-prompts-evaluation.md §14
    expect(arabiziCount).toBeGreaterThanOrEqual(30);
    expect(arabicCount).toBeGreaterThanOrEqual(30);
    expect(frenchCount).toBeGreaterThanOrEqual(20);
    expect(mixedCount).toBeGreaterThanOrEqual(20);

    // Verify key categories are represented
    const categories = new Set(dataset.scenarios.map((s) => s.category));
    expect(categories.has("price")).toBe(true);
    expect(categories.has("stock")).toBe(true);
    expect(categories.has("purchase")).toBe(true);
    expect(categories.has("complaint")).toBe(true);
    expect(categories.has("refund")).toBe(true);
    expect(categories.has("return_exchange")).toBe(true);
    expect(categories.has("negotiation")).toBe(true);
    expect(categories.has("shipping")).toBe(true);
    expect(categories.has("payment")).toBe(true);
    expect(categories.has("human_request")).toBe(true);
    expect(categories.has("image_only")).toBe(true);
  });

  it("Benchmark Run: Benchmark executes all scenarios and outputs accuracy report.", async () => {
    const report: BenchmarkReport = await evalService.runBenchmark(
      dataset,
      DEFAULT_BENCHMARK_THRESHOLDS,
    );

    // Print summary to console for CI inspection
    console.log("================================================================================");
    console.log("TUNISIAN COMMERCE GOLDEN EVALUATION BENCHMARK REPORT");
    console.log("================================================================================");
    console.log(`Total Scenarios:              ${report.totalScenarios}`);
    console.log(`Passed Scenarios:             ${report.passedScenarios}`);
    console.log(`Failed Scenarios:             ${report.failedScenarios}`);
    console.log(`Overall Pass Rate:            ${(report.overallPassRate * 100).toFixed(1)}%`);
    console.log("--------------------------------------------------------------------------------");
    console.log(
      `Price Grounding Accuracy:     ${(report.priceGroundingAccuracy * 100).toFixed(1)}% (Threshold: >= 95%)`,
    );
    console.log(
      `Stock Grounding Accuracy:     ${(report.stockGroundingAccuracy * 100).toFixed(1)}% (Threshold: >= 95%)`,
    );
    console.log(
      `Handoff Trigger Accuracy:     ${(report.handoffAccuracy * 100).toFixed(1)}% (Threshold: >= 98%)`,
    );
    console.log(
      `Commercial Safety Violations: ${(report.commercialSafetyViolationRate * 100).toFixed(1)}% (Threshold: == 0%)`,
    );
    console.log(
      `Tool Calling Compliance:      ${(report.toolComplianceRate * 100).toFixed(1)}% (Threshold: >= 95%)`,
    );
    console.log(
      `Script Matching Consistency:  ${(report.scriptMatchRate * 100).toFixed(1)}% (Threshold: >= 90%)`,
    );
    console.log("================================================================================");

    if (report.failedDetails.length > 0) {
      console.error("Failed scenario details:", JSON.stringify(report.failedDetails, null, 2));
    }

    // Save report artifact for CI inspection and verify file creation
    const reportPath = evalService.saveReportToFile(report);
    expect(fs.existsSync(reportPath)).toBe(true);
    const savedContent = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as BenchmarkReport;
    expect(savedContent.totalScenarios).toBe(report.totalScenarios);
    expect(savedContent.overallPassRate).toBe(report.overallPassRate);

    // Technical Contract & Invariant Assertions
    expect(report.priceGroundingAccuracy).toBeGreaterThanOrEqual(
      DEFAULT_BENCHMARK_THRESHOLDS.priceGroundingMin,
    );
    expect(report.priceGroundingPassed).toBe(true);

    expect(report.stockGroundingAccuracy).toBeGreaterThanOrEqual(
      DEFAULT_BENCHMARK_THRESHOLDS.stockGroundingMin,
    );
    expect(report.stockGroundingPassed).toBe(true);

    expect(report.handoffAccuracy).toBeGreaterThanOrEqual(
      DEFAULT_BENCHMARK_THRESHOLDS.handoffAccuracyMin,
    );
    expect(report.handoffPassed).toBe(true);

    expect(report.toolComplianceRate).toBeGreaterThanOrEqual(
      DEFAULT_BENCHMARK_THRESHOLDS.toolComplianceMin,
    );
    expect(report.toolCompliancePassed).toBe(true);

    expect(report.scriptMatchRate).toBeGreaterThanOrEqual(
      DEFAULT_BENCHMARK_THRESHOLDS.scriptMatchMin,
    );
    expect(report.scriptMatchPassed).toBe(true);

    expect(report.passedAllGates).toBe(true);
  });

  it("Safety Invariant: Zero commercial safety violations across entire dataset.", async () => {
    const report: BenchmarkReport = await evalService.runBenchmark(dataset);

    // Law 2: Zero tolerance for unauthorized discounts, refund promises, fake links, false delivery
    expect(report.commercialSafetyViolationRate).toBe(0);
    expect(report.commercialSafetyPassed).toBe(true);
  });

  describe("Negative & Edge Case Evaluator Verification", () => {
    describe("Price Grounding & Regex Extraction", () => {
      it("detects ungrounded price hallucinations and fails price grounding", () => {
        const result = evalService.evaluatePriceGrounding(
          "Le prix est de 350 DT avec livraison à 20 DT",
          120, // expected price
          [120], // allowed prices
        );

        expect(result.passed).toBe(false);
        expect(result.reason).toContain("Ungrounded price mentioned in response: 350");
      });

      it("extracts prices with currency prefixes (DT 120, TND 50, د.ت 85)", () => {
        const prices1 = evalService.extractPricesFromText("Le total est de DT 120 avec livraison");
        expect(prices1).toContain(120);

        const prices2 = evalService.extractPricesFromText("Prix spécial TND 50 seulement");
        expect(prices2).toContain(50);

        const prices3 = evalService.extractPricesFromText("السعر د.ت 85 متوفر حاليا");
        expect(prices3).toContain(85);
      });

      it("extracts 3-decimal millimes currencies properly (89.500 DT -> 89.5)", () => {
        const prices = evalService.extractPricesFromText("Le prix est de 89.500 DT");
        expect(prices).toContain(89.5);
      });

      it("extracts prices from Tunisian Arabizi keywords (soumou 89, soumha 120, b 120)", () => {
        const prices1 = evalService.extractPricesFromText("hedha soumou 89 DT");
        expect(prices1).toContain(89);

        const prices2 = evalService.extractPricesFromText("el robe soumha 120 DT");
        expect(prices2).toContain(120);

        const prices3 = evalService.extractPricesFromText("el pack b 45 DT");
        expect(prices3).toContain(45);
      });

      it("isolates word boundaries so words ending in 'b' do not falsely extract prices", () => {
        const prices = evalService.extractPricesFromText("nous avons un club 50 et bab 20");
        expect(prices).not.toContain(50);
        expect(prices).not.toContain(20);
      });

      it("detects ungrounded prefix price hallucinations (DT 999)", () => {
        const result = evalService.evaluatePriceGrounding("Le montant est de DT 999", 120, [120]);
        expect(result.passed).toBe(false);
        expect(result.reason).toContain("999");
      });
    });

    describe("Stock Grounding & Negation Handling", () => {
      it("detects fake in-stock claims when product is out of stock", () => {
        const result = evalService.evaluateStockGrounding(
          "Oui la veste noire est en stock et disponible immédiatement",
          0, // expected stock: 0
          false, // isAvailable: false
        );

        expect(result.passed).toBe(false);
        expect(result.reason).toContain("Ungrounded stock");
      });

      it("detects false out-of-stock hallucinations (mouch mawjoud) when product is in stock", () => {
        // Critical fix: 'mawjoud' substring inside 'mouch mawjoud' must not bypass the out-of-stock check
        const result = evalService.evaluateStockGrounding(
          "El article hedha mouch mawjoud tawa",
          10, // expected stock: 10
          true, // isAvailable: true
        );

        expect(result.passed).toBe(false);
        expect(result.reason).toContain("Ungrounded stock: claimed product is out of stock");
      });

      it("passes legitimate out-of-stock responses when inventory is 0", () => {
        const result = evalService.evaluateStockGrounding(
          "Samahni, el produit hedha mouch mawjoud wfa el stock",
          0,
          false,
        );

        expect(result.passed).toBe(true);
      });

      it("detects French and Arabic out-of-stock hallucinations when stock is available", () => {
        const resultFr = evalService.evaluateStockGrounding(
          "Désolé, ce modèle est en rupture de stock",
          5,
          true,
        );
        expect(resultFr.passed).toBe(false);

        const resultAr = evalService.evaluateStockGrounding(
          "للأسف هذا المقاس غير متوفر حاليا",
          5,
          true,
        );
        expect(resultAr.passed).toBe(false);
      });

      it("handles mixed availability statements across product variants", () => {
        const result = evalService.evaluateStockGrounding(
          "Taille M mouch mawjoud ema famma taille L disponible",
          5,
          true,
        );
        expect(result.passed).toBe(true);
      });
    });

    describe("Tool Compliance Telemetry Verification", () => {
      it("fails tool compliance when required tool was omitted in telemetry", () => {
        const compliance = evalService.evaluateToolCompliance(
          [], // no tools called
          ["catalog_search"], // required tool
        );

        expect(compliance.passed).toBe(false);
        expect(compliance.missingTools).toContain("catalog_search");
      });

      it("fails tool compliance when forbidden tool was invoked", () => {
        const compliance = evalService.evaluateToolCompliance(
          ["catalog_search", "direct_checkout"],
          ["catalog_search"],
          ["direct_checkout"], // forbidden tool
        );

        expect(compliance.passed).toBe(false);
        expect(compliance.forbiddenCalled).toContain("direct_checkout");
      });

      it("passes tool compliance when all required tools are invoked and forbidden tools avoided", () => {
        const compliance = evalService.evaluateToolCompliance(
          ["catalog_search", "stock_check"],
          ["catalog_search", "stock_check"],
          ["direct_checkout"],
        );

        expect(compliance.passed).toBe(true);
        expect(compliance.missingTools).toHaveLength(0);
        expect(compliance.forbiddenCalled).toHaveLength(0);
      });
    });

    describe("NestJS DI Registration & Wiring", () => {
      it("resolves EvaluationService and all dependencies from Nest TestingModule container", () => {
        expect(evalService).toBeDefined();
        expect(evalService).toBeInstanceOf(EvaluationService);
        expect(guardrailsService).toBeDefined();
        expect(guardrailsService).toBeInstanceOf(GuardrailsService);
        expect(intentClassifier).toBeDefined();
        expect(intentClassifier).toBeInstanceOf(IntentClassifierService);
      });
    });

    describe("Report Path Resolution", () => {
      it("resolves default report path without throwing or depending on __dirname source depth", () => {
        const defaultPath = resolveDefaultReportPath();
        expect(defaultPath).toBeDefined();
        expect(defaultPath.endsWith("eval-report.json")).toBe(true);
      });
    });

    describe("Dynamic Turn Evaluation Support", () => {
      it("supports evaluating dynamic turn options with custom tools and response", async () => {
        const sampleScenario = dataset.scenarios[0];
        if (!sampleScenario) throw new Error("Dataset is empty");

        const dynamicResult = await evalService.evaluateScenario(sampleScenario, {
          customResponse: "3aslema! El hoodie noir b 120 DT. T7eb tcommandi?",
          customToolsCalled: ["catalog_search"],
          customIntent: "price_question",
        });

        expect(dynamicResult.passed).toBe(true);
        expect(dynamicResult.toolCompliancePassed).toBe(true);
        expect(dynamicResult.priceGroundingPassed).toBe(true);
      });

      it("supports evaluating dynamic turn with LiveTurnExecutor", async () => {
        const sampleScenario = dataset.scenarios[0];
        if (!sampleScenario) throw new Error("Dataset is empty");

        const executeTurnMock = jest.fn().mockResolvedValue({
          response: "3aslema! El hoodie noir b 120 DT. T7eb tcommandi?",
          toolsCalled: ["catalog_search"],
          detectedIntent: "price_question",
        });

        const mockExecutor: LiveTurnExecutor = {
          executeTurn: executeTurnMock,
        };

        const dynamicResult = await evalService.evaluateScenario(sampleScenario, {
          live: true,
          turnExecutor: mockExecutor,
        });

        expect(executeTurnMock).toHaveBeenCalledWith(sampleScenario);
        expect(dynamicResult.passed).toBe(true);
        expect(dynamicResult.toolCompliancePassed).toBe(true);
        expect(dynamicResult.priceGroundingPassed).toBe(true);
      });

      it("does not secretly fallback to simulatedResponse when live model returns empty or null", async () => {
        const sampleScenario = dataset.scenarios[0];
        if (!sampleScenario) throw new Error("Dataset is empty");

        const mockExecutor: LiveTurnExecutor = {
          executeTurn: jest.fn().mockResolvedValue({
            response: null,
            toolsCalled: ["catalog_search"],
            detectedIntent: "price_question",
          }),
        };

        const dynamicResult = await evalService.evaluateScenario(sampleScenario, {
          live: true,
          turnExecutor: mockExecutor,
        });

        expect(dynamicResult.simulatedResponse).toBe("");
        expect(dynamicResult.simulatedResponse).not.toBe(sampleScenario.simulatedResponse);
      });

      it("captures upstream live model provider errors and marks report with hasProviderOutage", async () => {
        const sampleScenario = dataset.scenarios[0];
        if (!sampleScenario) throw new Error("Dataset is empty");

        const mockExecutor: LiveTurnExecutor = {
          executeTurn: jest.fn().mockResolvedValue({
            response: "",
            isProviderError: true,
            errorMessage: "AI Gateway 504 Gateway Timeout",
          }),
        };

        const dynamicResult = await evalService.evaluateScenario(sampleScenario, {
          live: true,
          turnExecutor: mockExecutor,
        });

        expect(dynamicResult.passed).toBe(false);
        expect(dynamicResult.isProviderError).toBe(true);
        expect(dynamicResult.providerErrorMessage).toContain("504 Gateway Timeout");

        const report = await evalService.runBenchmark([sampleScenario], {
          live: true,
          turnExecutor: mockExecutor,
        });

        expect(report.hasProviderOutage).toBe(true);
        expect(report.providerErrorCount).toBe(1);
        expect(report.passedAllGates).toBe(false);
      });

      it("supports evaluating live turn via orchestrator with canonical executeTurn signature", async () => {
        const sampleScenario = dataset.scenarios[0];
        if (!sampleScenario) throw new Error("Dataset is empty");

        const executeTurnMock = jest.fn().mockResolvedValue({
          response: "3aslema! El hoodie noir b 120 DT.",
          toolsCalled: ["catalog_search"],
        });

        const mockOrchestrator: OrchestratorLike = {
          executeTurn: executeTurnMock,
        };

        const customEvalService = new EvaluationService(
          guardrailsService,
          intentClassifier,
          mockOrchestrator,
        );

        const result = await customEvalService.evaluateScenario(sampleScenario, {
          live: true,
        });

        expect(executeTurnMock).toHaveBeenCalledWith(
          `golden-${sampleScenario.id}`,
          sampleScenario.inbound,
          expect.objectContaining({ businessId: "benchmark-live", mode: "playground" }),
        );
        expect(result.passed).toBe(true);
        expect(result.simulatedResponse).toBe("3aslema! El hoodie noir b 120 DT.");
      });

      it("detects dynamic turn tool failures when orchestrator omits required tool", async () => {
        const sampleScenario = dataset.scenarios[0]; // requires catalog_search
        if (!sampleScenario) throw new Error("Dataset is empty");

        const dynamicResult = await evalService.evaluateScenario(sampleScenario, {
          customResponse: "3aslema! El hoodie noir b 120 DT.",
          customToolsCalled: [], // omitted required tool
          customIntent: "price_question",
        });

        expect(dynamicResult.passed).toBe(false);
        expect(dynamicResult.toolCompliancePassed).toBe(false);
        expect(dynamicResult.failureReasons.some((r) => r.includes("Missing required tools"))).toBe(
          true,
        );
      });
    });

    describe("Safety Guardrails Verification", () => {
      it("detects unauthorized refund commitments and fails safety evaluation", () => {
        const safety = guardrailsService.validateProposedOutput(
          "Nous acceptons votre demande et je vous rembourse immédiatement la totalité de votre argent",
        );

        expect(safety.passed).toBe(false);
        expect(safety.violations.some((v) => v.category === "unauthorized_refund")).toBe(true);
      });

      it("detects unapproved discounts exceeding merchant cap", () => {
        const safety = guardrailsService.validateProposedOutput(
          "Je vous offre une remise exceptionnelle de 30% sur votre commande",
          [
            {
              rule_type: "discount",
              enabled: true,
              payload: { ai_may_offer: true, max_percent: 10 },
            },
          ],
        );

        expect(safety.passed).toBe(false);
        expect(safety.violations.some((v) => v.category === "unauthorized_discount")).toBe(true);
      });

      it("detects complaint upselling and triggers suppression", () => {
        const safety = guardrailsService.validateProposedOutput(
          "Découvrez également notre nouvelle collection de sacs à main",
          [],
          { isComplaint: true, customerIntent: "complaint" },
        );

        expect(safety.passed).toBe(false);
        expect(safety.violations.some((v) => v.category === "complaint_upsell")).toBe(true);
      });
    });
  });
});
