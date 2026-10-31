# 02. Class Diagrams

The domain is large, so it is modelled as **seven bounded-context diagrams** (C1 to C7), then a **module/service dependency diagram** (C8) and a **design-pattern map** (C9). Together they answer three questions a reviewer asks:

1. *What are the things in the business?* (C1 to C7: entities, value objects, enumerations)
2. *Who is allowed to change them?* (C8: each module owns its data; others call its service)
3. *Which known solutions are reused?* (C9: State, Strategy, Adapter, Facade, Observer, Repository)

## How to read the diagrams

| Notation | Meaning |
|---|---|
| `<<entity>>` | Persisted object with identity |
| `<<value>>` | Immutable value object, stored as JSON or embedded |
| `<<enumeration>>` | Closed set of values |
| `<<service>>` | Stateless domain service (the only writer of its module's data) |
| `<<interface>>` | Port: a contract implemented elsewhere |
| `*--` composition | Child cannot exist without parent; deleted with it |
| `o--` aggregation | Child has its own life but belongs to a parent |
| `-->` association | One object holds a reference to another |
| `..>` dependency | Uses at call time, no stored reference |
| `..|>` realisation | Class implements an interface |
| `"1"`, `"*"`, `"0..1"` | Multiplicity |

**Tenancy rule that applies to every entity below:** every entity (except global reference data such as `Permission` and `Plan`) carries `business_id`. Composite foreign keys `(id, business_id)` make it impossible for a row in one workspace to point at a row in another.

---

## C1. Identity, tenancy and access

Who the users are, which workspace they belong to, and what each role may do.

```mermaid
classDiagram
    direction LR

    class User {
        <<entity>>
        +String id
        +String email
        +String name
        +DateTime emailVerifiedAt
        +signIn(credentials) Session
        +signOut(sessionId) void
    }
    class Session {
        <<entity>>
        +String id
        +String userId
        +DateTime expiresAt
        +String ipAddress
        +isExpired() Boolean
    }
    class Business {
        <<entity>>
        +String id
        +String name
        +String industry
        +String country
        +String defaultLanguage
        +String timezone
        +String currency
        +Json settings
        +DateTime deletedAt
        +DateTime deleteAfter
        +isActive() Boolean
    }
    class BusinessMember {
        <<entity>>
        +String id
        +String businessId
        +String userId
        +String roleId
        +DateTime joinedAt
        +DateTime removedAt
        +DateTime lastActiveAt
        +can(permissionCode) Boolean
    }
    class Role {
        <<entity>>
        +String id
        +String businessId
        +String name
    }
    class Permission {
        <<entity>>
        +String code
    }
    class Invitation {
        <<entity>>
        +String id
        +String email
        +String tokenHash
        +DateTime expiresAt
        +DateTime acceptedAt
        +accept(user) BusinessMember
        +isExpired() Boolean
    }
    class BusinessOnboarding {
        <<entity>>
        +Boolean catalogReady
        +Boolean rulesAcknowledged
        +Boolean channelActive
        +Boolean aiTested
        +Boolean handoffAcknowledged
        +unmetGates() String[]
        +isActivationReady() Boolean
    }
    class AuditLog {
        <<entity>>
        +String actorUserId
        +String action
        +String entityType
        +String entityId
        +Json before
        +Json after
        +DateTime createdAt
    }
    class AuthService {
        <<service>>
        +register(email, password) User
        +signIn(email, password) Session
        +resetPassword(token, newPassword) void
    }
    class BusinessService {
        <<service>>
        +createWorkspace(owner, name, tz, currency) Business
        +invite(actor, email, role) Invitation
        +removeMember(actor, memberId) void
        +activateAi(actor) void
    }
    class TenantGuard {
        <<service>>
        +resolve(request) TenantContext
        +assertPermission(ctx, code) void
    }

    User "1" --> "*" Session : opens
    User "1" --> "*" BusinessMember : is
    Business "1" *-- "*" BusinessMember : has
    Business "1" *-- "*" Invitation : issues
    Business "1" *-- "1" BusinessOnboarding : tracks
    Business "1" o-- "*" Role : defines
    Role "*" o-- "*" Permission : grants
    BusinessMember "*" --> "1" Role : holds
    Business ..> AuditLog : changes recorded
    AuthService ..> User
    BusinessService ..> Business
    BusinessService ..> BusinessOnboarding : reads gates
    TenantGuard ..> BusinessMember : resolves role
```

**Design notes**

- **Three roles** (Owner, Admin, Employee) are rows in `Role`, with permission codes in `Permission`. The server checks the permission code, never the role name, so a role's capabilities can change without code changes.
- There is **exactly one Owner**; the Owner cannot be demoted, removed or invited, and ownership cannot be transferred in Phase 1.
- `BusinessOnboarding` is the single source of truth for the five **activation gates** (G1 to G5). `unmetGates()` returns all failures at once so the API can list them, not just the first.
- `Business.deletedAt` / `deleteAfter` implement soft-delete with a retention window.

---

## C2. Catalog, inventory and knowledge

What the shop sells, how much is left, and the facts the AI is allowed to say.

```mermaid
classDiagram
    direction TB

    class ProductCategory {
        <<entity>>
        +String id
        +String name
        +String parentId
    }
    class Product {
        <<entity>>
        +String id
        +String businessId
        +String name
        +String description
        +ProductStatus status
        +String currency
        +Json benefits
        +Json sellingPoints
        +Json objections
        +Json faqs
        +activate() void
        +archive() void
    }
    class ProductVariant {
        <<entity>>
        +String id
        +String sku
        +String barcode
        +Json attributes
        +Decimal price
        +Decimal discountPrice
        +Int stock
        +Boolean isDefault
        +effectivePrice() Decimal
        +availableStock() Int
    }
    class ProductImage {
        <<entity>>
        +String id
        +String url
        +Int sortOrder
    }
    class StockReservation {
        <<entity>>
        +String id
        +String variantId
        +String conversationId
        +String orderId
        +Int quantity
        +ReservationStatus status
        +DateTime reservedAt
        +DateTime expiresAt
        +commit() void
        +release() void
        +expire() void
    }
    class InventoryMovement {
        <<entity>>
        +String id
        +Int delta
        +String reason
        +String orderId
        +DateTime createdAt
    }
    class BusinessRule {
        <<entity>>
        +String id
        +RuleType ruleType
        +Json payload
        +Int priority
        +Boolean enabled
        +DateTime effectiveFrom
        +DateTime effectiveTo
        +appliesAt(instant) Boolean
    }
    class KnowledgeDocument {
        <<entity>>
        +String id
        +String title
        +String sourceType
        +String rawText
        +String contentHash
        +IndexingStatus indexingStatus
    }
    class Embedding {
        <<entity>>
        +String sourceId
        +Int chunkIndex
        +String chunkText
        +String contentHash
        +Vector1536 vector
    }
    class CatalogImportRun {
        <<entity>>
        +String id
        +ImportStatus status
        +Int totalRows
        +Int validRows
        +Json rowErrors
    }
    class ProductStatus {
        <<enumeration>>
        draft
        active
        archived
    }
    class ReservationStatus {
        <<enumeration>>
        active
        committed
        released
        expired
    }
    class RuleType {
        <<enumeration>>
        delivery
        payment
        returns
        working_hours
        discount
        min_order
        free_shipping
    }
    class IndexingStatus {
        <<enumeration>>
        pending
        indexing
        ready
        failed
    }
    class ImportStatus {
        <<enumeration>>
        uploaded
        validated
        previewed
        running
        succeeded
        failed
    }
    class CatalogService {
        <<service>>
        +searchVariants(businessId, query) ProductVariant[]
        +import(businessId, file) CatalogImportRun
    }
    class InventoryService {
        <<service>>
        +reserve(variantId, qty, conversationId, ttl) StockReservation
        +commit(reservationId) void
        +release(reservationId) void
        +expireDue() Int
    }
    class KnowledgeService {
        <<service>>
        +index(document) void
        +retrieve(businessId, query, topK) Embedding[]
    }
    class BusinessRulesService {
        <<service>>
        +lookup(businessId, type, context) BusinessRule
        +detectConflicts(businessId) String[]
    }

    ProductCategory "0..1" o-- "*" ProductCategory : parent of
    ProductCategory "1" o-- "*" Product : groups
    Product "1" *-- "1..*" ProductVariant : sold as
    Product "1" *-- "*" ProductImage : shown by
    ProductVariant "1" --> "*" StockReservation : held by
    ProductVariant "1" *-- "*" InventoryMovement : ledger
    KnowledgeDocument "1" *-- "*" Embedding : chunked into
    Product ..> Embedding : indexed as
    BusinessRule ..> RuleType
    Product ..> ProductStatus
    StockReservation ..> ReservationStatus
    KnowledgeDocument ..> IndexingStatus
    CatalogImportRun ..> ImportStatus
    CatalogService ..> Product
    InventoryService ..> StockReservation
    InventoryService ..> InventoryMovement : writes
    KnowledgeService ..> Embedding
    BusinessRulesService ..> BusinessRule
```

**Design notes**

- **Stock is a number plus a ledger.** `ProductVariant.stock` is the current balance. `InventoryMovement` records every delta with a reason, so any balance can be audited.
- **Available stock = stock minus active reservations.** A `StockReservation` holds units while a customer is mid-purchase and expires after a configured TTL (`reservation_ttl_minutes`). A scheduled job releases expired holds.
- **Reservation correctness lives in the database** (an atomic conditional update), not in the AI conversation lock. The Redis lock only prevents two AI turns running on the same thread.
- **Rules are data.** `BusinessRule.payload` is validated per `RuleType`. When two enabled rules conflict, `detectConflicts` flags it and the AI escalates with `policy_conflict` rather than guessing.
- **Knowledge is retrieval, not memory.** Embeddings are tagged by source so a product edit re-indexes only that product (`contentHash` skips unchanged chunks).

---

## C3. Customers and conversations

The people who write in, the conversations they have, and the messages inside them.

```mermaid
classDiagram
    direction LR

    class Customer {
        <<entity>>
        +String id
        +String name
        +String phone
        +String email
        +Json address
        +String language
        +LifecycleStage lifecycleStage
        +Int confirmedOrderCount
        +DateTime lastConfirmedOrderAt
        +String mergedIntoCustomerId
        +DateTime erasedAt
        +Boolean isTest
        +merge(target) void
        +erase() void
    }
    class CustomerIdentity {
        <<entity>>
        +Channel platform
        +String platformUserId
        +String phoneNumber
        +DateTime verifiedAt
    }
    class CustomerTag {
        <<entity>>
        +String label
    }
    class CustomerNote {
        <<entity>>
        +String authorUserId
        +String body
    }
    class Conversation {
        <<entity>>
        +String id
        +ConversationSource source
        +String externalThreadId
        +ConversationStatus status
        +Boolean aiEnabled
        +String assignedUserId
        +String lastIntent
        +String escalationReason
        +HandoffPriority handoffPriority
        +HandoffContext handoffContext
        +DateTime handoffAt
        +DateTime handoffCompletedAt
        +String summary
        +Json collectedFields
        +DateTime snoozedUntil
        +Int leadScore
        +LeadTemperature leadTemperature
        +DateTime lastMessageAt
        +String lastMessagePreview
        +DateTime staffReadAt
        +Boolean isTest
        +hasPendingOrder() Boolean
    }
    class ConversationStatusEvent {
        <<entity>>
        +ConversationStatus fromStatus
        +ConversationStatus toStatus
        +String reason
        +String actorType
        +DateTime at
    }
    class ConversationAssignment {
        <<entity>>
        +String userId
        +String assignedByUserId
        +AssignmentStatus status
        +DateTime assignedAt
        +DateTime releasedAt
    }
    class ConversationNote {
        <<entity>>
        +String authorUserId
        +String body
    }
    class Message {
        <<entity>>
        +String id
        +MessageDirection direction
        +SenderType senderType
        +String senderUserId
        +String content
        +ContentType contentType
        +String externalMessageId
        +String idempotencyKey
        +Json aiMetadata
        +MessageDeliveryStatus deliveryStatus
        +DateTime createdAt
    }
    class MessageAttachment {
        <<entity>>
        +String url
        +String mimeType
        +Int sortOrder
    }
    class ConversationStatus {
        <<enumeration>>
        NEW
        AI_ACTIVE
        ORDER_INTENT_DETECTED
        HUMAN_REQUIRED
        HUMAN_HANDLING
        ORDER_CONFIRMED
        RESOLVED
    }
    class SenderType {
        <<enumeration>>
        customer
        ai
        human
        system
    }
    class MessageDeliveryStatus {
        <<enumeration>>
        draft
        queued
        sent
        delivered
        failed
    }
    class LifecycleStage {
        <<enumeration>>
        unknown_visitor
        interested
        qualified_lead
        order_pending
        customer
        returning_customer
        vip
    }
    class LeadTemperature {
        <<enumeration>>
        cold
        warm
        hot
    }
    class HandoffPriority {
        <<enumeration>>
        critical
        high
        normal
    }
    class ConversationService {
        <<service>>
        +transition(id, to, reason, actor) Conversation
        +ingest(inbound) Message
        +takeOver(id, userId) Conversation
        +resume(id, userId) Conversation
        +close(id, userId) Conversation
    }
    class LeadScoringService {
        <<service>>
        +recompute(conversationId) Int
    }

    Customer "1" *-- "1..*" CustomerIdentity : known as
    Customer "1" *-- "*" CustomerTag
    Customer "1" *-- "*" CustomerNote
    Customer "1" --> "*" Conversation : starts
    Conversation "1" *-- "*" Message : contains
    Message "1" *-- "*" MessageAttachment
    Conversation "1" *-- "*" ConversationStatusEvent : audit trail
    Conversation "1" *-- "*" ConversationAssignment
    Conversation "1" *-- "*" ConversationNote
    Conversation ..> ConversationStatus
    Conversation ..> HandoffPriority
    Conversation ..> LeadTemperature
    Message ..> SenderType
    Message ..> MessageDeliveryStatus
    Customer ..> LifecycleStage
    ConversationService ..> Conversation : sole writer of status
    LeadScoringService ..> Conversation : writes score
```

**Design notes**

- **`ConversationService.transition` is the only code that may change `status`.** Every call appends a `ConversationStatusEvent`, which gives a full audit trail and makes the state machine testable in isolation (see S1).
- **Two flags, not one.** `ai_enabled` says whether the AI may speak. `status` says where the sale is. Taking over turns `ai_enabled` off without changing the collection label; only `HUMAN_REQUIRED` moves to `HUMAN_HANDLING`.
- **Idempotency is a column.** `Message.idempotencyKey` is unique, and `(channelAccountId, externalMessageId)` is unique, so a replayed webhook cannot create a second message.
- **Identity resolution:** one `Customer` may have several `CustomerIdentity` rows (Instagram id, Messenger id, phone), which is how a returning customer is recognised across channels. Duplicates merge by pointing `mergedIntoCustomerId` at the survivor.
- **`isTest` rows** (playground) are excluded from KPIs, billing and Meta delivery.

---

## C4. Orders and human handoff

How a conversation becomes an order, and what a human receives when the AI hands over.

```mermaid
classDiagram
    direction TB

    class Order {
        <<entity>>
        +String id
        +String customerId
        +String conversationId
        +OrderStatus status
        +PaymentStatus paymentStatus
        +String currency
        +Decimal subtotal
        +Decimal deliveryFee
        +Decimal total
        +Json customerSnapshot
        +Json deliveryAddress
        +String createdByType
        +String createdByUserId
        +String idempotencyKey
        +Boolean isTest
        +DateTime orderConfirmedAt
        +DateTime cancelledAt
        +DateTime completedAt
        +confirm(actor) void
        +cancel(actor, reason) void
        +isAiAttributed() Boolean
    }
    class OrderItem {
        <<entity>>
        +String variantId
        +Int quantity
        +Decimal unitPrice
        +String nameSnapshot
        +String skuSnapshot
        +Json attributesSnapshot
        +lineTotal() Decimal
    }
    class OrderStatus {
        <<enumeration>>
        PENDING_CONFIRMATION
        CONFIRMED
        CANCELLED
        COMPLETED
    }
    class PaymentStatus {
        <<enumeration>>
        NOT_COMPLETED
        COMPLETED
    }
    class HandoffContext {
        <<value>>
        +String reason
        +HandoffPriority priority
        +String summary
        +Json collectedFields
        +String pendingOrderId
        +String suggestedNextStep
        +String[] losingReasons
    }
    class HandoffTrigger {
        <<enumeration>>
        purchase_handoff
        payment_issue
        refund_request
        return_exchange
        complaint
        low_confidence
        human_request
        negotiation
        custom_order
        vip_customer
        bulk_order
        legal_sensitive
        inventory_conflict
        policy_conflict
        integration_failure
    }
    class PurchaseCollection {
        <<value>>
        +String variantId
        +Int quantity
        +String customerName
        +String phone
        +Json address
        +missingFields() String[]
        +isComplete() Boolean
    }
    class OrderService {
        <<service>>
        +createPending(input, idempotencyKey) Order
        +confirm(orderId, actor) Order
        +cancel(orderId, actor) Order
        +createManual(input, actor) Order
    }
    class HandoffService {
        <<service>>
        +buildContext(turn, trigger) HandoffContext
        +resolveConflict(triggers) HandoffTrigger
    }
    class StockReservation {
        <<entity>>
        +ReservationStatus status
    }
    class Conversation {
        <<entity>>
        +ConversationStatus status
    }
    class Customer {
        <<entity>>
        +LifecycleStage lifecycleStage
    }

    Order "1" *-- "1..*" OrderItem : lines
    Order "*" --> "1" Customer : placed by
    Order "0..1" --> "1" Conversation : originated in
    Order "1" --> "*" StockReservation : holds stock via
    Order ..> OrderStatus
    Order ..> PaymentStatus
    Conversation "1" --> "0..1" HandoffContext : briefing
    HandoffContext ..> HandoffTrigger : reason
    PurchaseCollection ..> Order : becomes
    OrderService ..> Order : sole writer
    HandoffService ..> HandoffContext : builds
```

**Design notes**

- **Snapshots, not live links.** `OrderItem` copies name, SKU, attributes and unit price at order time, and `Order.customerSnapshot` copies the customer details. A later catalog edit never rewrites history.
- **`PaymentStatus` stays `NOT_COMPLETED`** in Phase 1: the system never takes money. This is deliberate, and it is why `PENDING_CONFIRMATION` exists.
- **`idempotencyKey` on `Order`** means a retried AI turn or double click cannot create two orders.
- **`HandoffContext` must validate before `HUMAN_REQUIRED` is entered.** A handoff without a parseable briefing is a defect, because the human would have to read the whole thread.
- **AI attribution:** `createdByType` records whether the AI tool chain created the order. The conversion KPI counts only AI-created orders, regardless of which human later confirmed them.
- **Trigger conflicts:** when two triggers match in one turn, the higher priority wins; the losing reason is kept in `losingReasons` for audit.

---

## C5. AI module

The decision-making core. It is the only part that talks to an LLM, and it has no direct database writes: it calls other modules' services. It is shown in three views so each stays readable: **C5a** the turn pipeline, **C5b** tools and LLM providers, **C5c** configuration and records.

### C5a. Turn pipeline

```mermaid
classDiagram
    direction TB

    class AIOrchestrator {
        <<service>>
        +processTurn(input) TurnResult
        -assertToolAllowedForMode(tool, mode) void
        -recheckLock(token) Boolean
    }
    class ProcessTurnInput {
        <<value>>
        +String businessId
        +String conversationId
        +String inboundMessageId
        +TurnMode mode
        +String lockToken
    }
    class TurnResult {
        <<value>>
        +String replyText
        +ReplyKind kind
        +IntendedTransition intendedTransition
        +HandoffContext handoff
        +Boolean staleLock
        +ToolCallRecord[] toolCalls
    }
    class TurnMode {
        <<enumeration>>
        inbound
        suggest
        playground
    }
    class IntentClassifier {
        <<interface>>
        +classify(message, context) IntentResult
    }
    class RuleIntentClassifier {
        <<service>>
        +classify(message, context) IntentResult
    }
    class LlmIntentClassifier {
        <<service>>
        +classify(message, context) IntentResult
    }
    class PolicyEngine {
        <<service>>
        +check(intent, context) PolicyDecision
        +matchTriggers(context) HandoffTrigger[]
    }
    class PromptBuilder {
        <<service>>
        +build(agent, context, tools) Prompt
        +version() String
    }
    class ToolExecutor {
        <<service>>
        +execute(call, mode) ToolResult
    }
    class ModelFallback {
        <<service>>
        +completeWithFallback(prompt) Completion
    }
    class Guardrails {
        <<service>>
        +verify(reply, toolFacts, rules) GuardrailVerdict
    }
    class ReplyModePolicy {
        <<service>>
        +decide(settings, flags) Delivery
    }

    AIOrchestrator ..> ProcessTurnInput : receives
    AIOrchestrator ..> TurnResult : returns
    ProcessTurnInput ..> TurnMode
    AIOrchestrator --> IntentClassifier : 1 classify
    AIOrchestrator --> PolicyEngine : 2 check triggers
    AIOrchestrator --> PromptBuilder : 3 build prompt
    AIOrchestrator --> ToolExecutor : 4 run tools
    AIOrchestrator --> ModelFallback : 5 generate
    AIOrchestrator --> Guardrails : 6 verify
    IntentClassifier <|.. RuleIntentClassifier
    IntentClassifier <|.. LlmIntentClassifier
    TurnResult ..> ReplyModePolicy : delivery decided by
```

### C5b. Tools and LLM providers

```mermaid
classDiagram
    direction LR

    class ToolExecutor {
        <<service>>
        +execute(call, mode) ToolResult
    }
    class Tool {
        <<interface>>
        +String name
        +Boolean mutates
        +run(args, tenant) ToolResult
    }
    class CatalogSearchTool {
        <<service>>
        mutates false
    }
    class StockCheckTool {
        <<service>>
        mutates false
    }
    class PolicyLookupTool {
        <<service>>
        mutates false
    }
    class ReserveStockTool {
        <<service>>
        mutates true
    }
    class CreatePendingOrderTool {
        <<service>>
        mutates true
    }
    class ModelFallback {
        <<service>>
        +completeWithFallback(prompt) Completion
    }
    class AiGateway {
        <<service>>
        +complete(prompt, model) Completion
    }
    class LlmProvider {
        <<interface>>
        +chat(request) Completion
    }
    class GroqProvider {
        <<service>>
    }
    class OrcaProvider {
        <<service>>
    }
    class VercelGatewayProvider {
        <<service>>
    }
    class CatalogService {
        <<external module>>
    }
    class InventoryService {
        <<external module>>
    }
    class OrderService {
        <<external module>>
    }
    class BusinessRulesService {
        <<external module>>
    }

    ToolExecutor o-- "*" Tool : registry
    Tool <|.. CatalogSearchTool
    Tool <|.. StockCheckTool
    Tool <|.. PolicyLookupTool
    Tool <|.. ReserveStockTool
    Tool <|.. CreatePendingOrderTool
    CatalogSearchTool ..> CatalogService
    StockCheckTool ..> InventoryService
    PolicyLookupTool ..> BusinessRulesService
    ReserveStockTool ..> InventoryService
    CreatePendingOrderTool ..> OrderService
    ModelFallback --> AiGateway
    AiGateway --> LlmProvider
    LlmProvider <|.. GroqProvider
    LlmProvider <|.. OrcaProvider
    LlmProvider <|.. VercelGatewayProvider
```

### C5c. Configuration and records

```mermaid
classDiagram
    direction LR

    class Business {
        <<entity>>
    }
    class AiAgent {
        <<entity>>
        +String name
        +String personality
        +String language
        +String tone
        +Decimal confidenceThreshold
        +Boolean enabled
    }
    class AiSettings {
        <<entity>>
        +String modelPrimary
        +String modelFallback
        +Int maxTokens
        +ReplyMode replyMode
        +Int ragTopK
        +String[] blockedTopics
        +Int reservationTtlMinutes
        +Decimal monthlyAiBudgetUsd
    }
    class ReplyMode {
        <<enumeration>>
        auto_send
        approval_required
        draft_only
    }
    class AiPrompt {
        <<entity>>
        +PromptType type
        +String version
        +String body
    }
    class Conversation {
        <<entity>>
    }
    class AiAction {
        <<entity>>
        +AiActionType actionType
        +String toolName
        +Json input
        +Json output
        +Boolean success
        +Int durationMs
    }
    class AiDecisionTrace {
        <<entity>>
        +Json decisionTrace
    }
    class AiUsage {
        <<entity>>
        +String provider
        +String model
        +Int tokensInput
        +Int tokensOutput
        +Decimal estimatedCostUsd
    }
    class AiFeedback {
        <<entity>>
        +FeedbackRating rating
        +FeedbackReason reason
        +String comment
    }
    class Message {
        <<entity>>
    }

    Business "1" *-- "1" AiAgent : persona
    Business "1" *-- "1" AiSettings : tuning
    Business "1" o-- "*" AiPrompt : versions
    AiSettings ..> ReplyMode
    Conversation "1" *-- "*" AiAction : tool calls and decisions
    Conversation "1" *-- "*" AiDecisionTrace : why each reply
    Conversation "1" *-- "*" AiUsage : tokens and cost
    AiPrompt "1" --> "*" AiUsage : version used
    Message "1" *-- "*" AiFeedback : staff rating
    AiFeedback ..> AiAction : reviews
```

**Design notes**

- **Facts enter from tools, never from the model.** The prompt carries tool results; `Guardrails.verify` checks every price, stock figure and policy in the draft against those results before anything is sent.
- **Mutating tools are gated.** `ReserveStockTool` and `CreatePendingOrderTool` have `mutates = true`. They are blocked in `suggest` and `playground` mode and require the conversation-lock token to still be valid at call time.
- **Tools never change conversation status.** They return an `IntendedTransition`; the worker applies it through `ConversationService`, preserving single-writer state.
- **Tools call other modules' services**, never their tables (see C8).
- **Caps** bound cost and runaway loops: at most 8 tool calls and 2 generator/tool rounds per turn, a per-attempt model timeout, and bounded output tokens.
- **Provider fallback** (Groq, then OrcaRouter, then Vercel AI Gateway) sits behind one `LlmProvider` interface, so changing providers is configuration, not a code change.
- **Observability is built in:** `AiAction`, `AiDecisionTrace` and `AiUsage` record what happened, why, and what it cost, per turn.

---

## C6. Integrations (channels)

How messages enter and leave the system without the rest of the code knowing about Meta.

```mermaid
classDiagram
    direction LR

    class ChannelAccount {
        <<entity>>
        +String id
        +Channel channel
        +String externalAccountId
        +String pageId
        +String igUserId
        +String displayName
        +String credentialsRef
        +ChannelAccountStatus status
        +DateTime lastInboundAt
        +DateTime tokenExpiresAt
        +String lastError
        +isHealthy() Boolean
    }
    class IntegrationEvent {
        <<entity>>
        +String provider
        +String externalEventId
        +Json payload
        +Json headers
        +Boolean signatureValid
        +DateTime processedAt
        +isPending() Boolean
    }
    class MessageTemplate {
        <<entity>>
        +String name
        +String language
        +String status
    }
    class Channel {
        <<enumeration>>
        instagram
        messenger
        whatsapp
    }
    class ChannelAccountStatus {
        <<enumeration>>
        pending
        pending_verification
        active
        error
        disconnected
    }
    class UnifiedMessaging {
        <<service>>
        +mapInbound(rawEvent) CanonicalInbound
        +send(canonicalOutbound) DeliveryResult
    }
    class ChannelAdapter {
        <<interface>>
        +verify(request) Boolean
        +mapInbound(raw) CanonicalInbound
        +send(out, account) DeliveryResult
    }
    class MessengerAdapter {
        <<service>>
    }
    class InstagramAdapter {
        <<service>>
    }
    class WhatsAppAdapter {
        <<service>>
        stub in Phase 1
    }
    class WidgetAdapter {
        <<service>>
    }
    class WebhookController {
        <<service>>
        +receive(request) HttpStatus
    }
    class CanonicalInbound {
        <<value>>
        +String channelAccountId
        +String externalMessageId
        +String externalUserId
        +String text
        +Attachment[] attachments
        +Boolean isLifecycle
    }
    class CanonicalOutbound {
        <<value>>
        +String messageId
        +String text
        +String recipientId
    }
    class OutboundDeliveryWorker {
        <<service>>
        +deliver(messageId) void
    }
    class TokenVault {
        <<interface>>
        +read(ref) Secret
        +write(secret) String
    }

    ChannelAccount "1" *-- "*" IntegrationEvent : receives
    ChannelAccount "1" o-- "*" MessageTemplate
    ChannelAccount ..> Channel
    ChannelAccount ..> ChannelAccountStatus
    ChannelAccount ..> TokenVault : credentialsRef
    WebhookController --> IntegrationEvent : persists first
    WebhookController --> ChannelAdapter : verify
    UnifiedMessaging --> ChannelAdapter : chooses by channel
    ChannelAdapter <|.. MessengerAdapter
    ChannelAdapter <|.. InstagramAdapter
    ChannelAdapter <|.. WhatsAppAdapter
    ChannelAdapter <|.. WidgetAdapter
    UnifiedMessaging ..> CanonicalInbound
    UnifiedMessaging ..> CanonicalOutbound
    OutboundDeliveryWorker --> UnifiedMessaging
```

**Design notes**

- **Adapter pattern.** Conversations only ever sees `CanonicalInbound` and `CanonicalOutbound`. Adding WhatsApp later means writing one adapter, not touching the inbox or the AI.
- **`IntegrationEvent` is the durability point.** The raw webhook is stored before the `200` is returned. A row with `processedAt = null` is retried by a sweep job, so a crash after acknowledging cannot lose a message.
- **Tokens never live in the database.** `ChannelAccount` stores only a `credentialsRef` pointing into a managed secret store (`TokenVault`).
- **Health:** `lastInboundAt`, `tokenExpiresAt` and `lastError` drive the channel-health view and the daily token check job.

---

## C7. Billing, analytics and notifications

Everything that observes the system rather than drives a sale.

```mermaid
classDiagram
    direction LR

    class Plan {
        <<entity>>
        +String code
        +String name
        +Json limits
        +limitFor(metric) Int
    }
    class Subscription {
        <<entity>>
        +SubscriptionStatus status
        +DateTime periodStart
        +DateTime periodEnd
        +String provider
        +isActive() Boolean
    }
    class UsageEvent {
        <<entity>>
        +UsageMetric metric
        +Int quantity
        +DateTime periodBucket
        +Boolean isTest
    }
    class UsageAggregate {
        <<entity>>
        +UsageMetric metric
        +Int total
        +DateTime periodBucket
    }
    class AnalyticsDaily {
        <<entity>>
        +Date day
        +Int messagesHandled
        +Int messagesAi
        +Int messagesHuman
        +Int ordersCreated
        +Int handoffsTotal
        +Json handoffsByReason
        +Int conversionConfirmed
        +Int conversionAiPending
        +conversionRate() Decimal
    }
    class Notification {
        <<entity>>
        +NotificationType type
        +HandoffPriority handoffPriority
        +String title
        +String message
        +String entityType
        +String entityId
        +String dedupeKey
        +DateTime readAt
        +markRead() void
    }
    class FeatureFlag {
        <<entity>>
        +String key
        +Boolean enabled
    }
    class UsageMetric {
        <<enumeration>>
        messages_in
        messages_out_ai
        orders_created
        whatsapp_conversations_started
    }
    class NotificationType {
        <<enumeration>>
        HOT_LEAD
        ORDER_REQUEST
        HANDOFF
        ESCALATION
    }
    class UsageService {
        <<service>>
        +record(businessId, metric, qty) void
        +isOverLimit(businessId, metric) Boolean
    }
    class AnalyticsService {
        <<service>>
        +kpis(businessId, from, to) KpiSet
        +rollupDay(businessId, day) AnalyticsDaily
    }
    class NotificationService {
        <<service>>
        +notify(recipients, type, entity, dedupeKey) void
    }
    class KpiSet {
        <<value>>
        +Int messagesHandled
        +Int aiHandled
        +Int humanHandled
        +Int ordersCreated
        +Int humanHandoffs
        +Decimal conversion
    }

    Plan "1" --> "*" Subscription
    Subscription ..> UsageEvent : limits apply to
    UsageEvent ..> UsageAggregate : summed hourly
    UsageEvent ..> UsageMetric
    Notification ..> NotificationType
    UsageService ..> UsageEvent
    UsageService ..> Plan : reads limits
    AnalyticsService ..> AnalyticsDaily
    AnalyticsService ..> KpiSet : returns
    NotificationService ..> Notification : dedupes
```

**Design notes**

- **Four counters only.** `KpiSet` is exactly the four canonical KPIs. `AnalyticsDaily` is a rollup table, so the dashboard reads one row per day instead of scanning every message.
- **Period semantics** use the business timezone: inclusive of the first day, exclusive of the day after the last.
- **Notifications dedupe** on `dedupeKey` so a retried job or a double event cannot spam staff.
- **Analytics and billing are off the hot path.** They consume events after the message flow is done.

---

## C8. Module and service dependency diagram

Each module **owns its tables** and exposes a **service** as its only entry point. Another module that needs the data calls that service; it never queries the other module's tables. This is the modular-monolith rule that stops the codebase becoming a ball of mud, and an architecture test enforces it.

```mermaid
classDiagram
    direction TB

    class Auth { <<module>> }
    class Businesses { <<module>> }
    class Products { <<module>> }
    class Customers { <<module>> }
    class Conversations { <<module>> }
    class AI { <<module>> }
    class Orders { <<module>> }
    class Integrations { <<module>> }
    class Analytics { <<module>> }
    class Notifications { <<module>> }
    class Realtime { <<module>> }

    Businesses ..> Auth : current user
    Conversations ..> Customers : resolve identity
    Conversations ..> Integrations : send via UnifiedMessaging
    Integrations ..> Conversations : ingest canonical inbound
    AI ..> Products : CatalogService, InventoryService
    AI ..> Businesses : BusinessRulesService
    AI ..> Conversations : ConversationService
    AI ..> Orders : OrderService.createPending
    Orders ..> Products : InventoryService commit or release
    Orders ..> Customers : lifecycle update
    Orders ..> Conversations : events only
    Analytics ..> Orders : events only
    Analytics ..> Conversations : events only
    Notifications ..> Businesses : recipients
    Realtime ..> Conversations : events only
```

| Module | Owns | Must not |
|---|---|---|
| Auth | users, sessions, credentials | know about conversations or Meta |
| Businesses | workspace, members, roles, rules, flags, plans | call Meta or the LLM |
| Products | catalog, stock, reservations, knowledge, embeddings | send messages or change conversation status |
| Customers | customers, identities, tags, notes | own conversations or orders |
| Conversations | conversations, messages, state machine, lead score | call Meta or the LLM directly |
| AI | agent config, prompts, orchestrator, traces, usage | persist orders or messages except through their services |
| Orders | orders, items, confirm and cancel | talk to Meta, mutate stock except through Products |
| Integrations | channel accounts, webhooks, adapters, delivery | import AI or inbox internals |
| Analytics | KPI rollups, usage | sit on the inbound hot path |
| Notifications | notifications and fan-out | decide when to hand off; it only delivers |
| Realtime | socket gateway | be a source of truth; it is an accelerator |

Dotted arrows marked "events only" mean the dependency is through in-process domain events, not direct calls (see [flow F6 to F11](04-sequence-flows.md)).

---

## C9. Design patterns applied

| Pattern | Where | Problem it solves | Class names |
|---|---|---|---|
| **State** | Conversation and order lifecycles | Illegal transitions (for example confirming a cancelled order) | `ConversationService.transition`, `Order.confirm` / `cancel`; allowed pairs listed in S1 and S2 |
| **Strategy** | Intent classification, LLM providers, reply modes | Swap algorithm without changing callers | `IntentClassifier` (rule or LLM), `LlmProvider`, `ReplyModePolicy` |
| **Adapter** | Channels | Meta's payloads differ per channel and change over time | `ChannelAdapter` implementations |
| **Facade** | Messaging, AI | Hide a subsystem behind one call | `UnifiedMessaging`, `AIOrchestrator.processTurn` |
| **Registry / Command** | AI tools | Uniform execution, permissions and logging of tool calls | `ToolExecutor` with `Tool` registry |
| **Chain of responsibility** | Provider fallback | Try next model if one fails | `ModelFallback` over providers |
| **Observer (domain events)** | Order confirmed, state changed, message received | Decouple modules; analytics and notifications react without being called | In-process event emitter |
| **Repository / ports** | Data access | Keep modules testable and tenant-scoped | Service layer over Prisma, tenant-scoped client |
| **Idempotent receiver** | Webhooks, jobs, orders | Exactly-once effect on at-least-once delivery | Unique keys, deterministic job ids |
| **Snapshot** | Orders | Preserve what the customer agreed to | `OrderItem.*Snapshot`, `Order.customerSnapshot` |
| **Value object** | Handoff briefing, canonical messages | Validated, immutable data crossing module boundaries | `HandoffContext`, `CanonicalInbound` |

### SOLID in this design

| Principle | Example |
|---|---|
| Single responsibility | Each module owns one domain; `Guardrails` only verifies, `PromptBuilder` only builds |
| Open/closed | New channel = new `ChannelAdapter`; new LLM = new `LlmProvider`; new tool = new `Tool` |
| Liskov | Any `Tool` or `LlmProvider` is substitutable behind its interface |
| Interface segregation | Ports are small (`Tool.run`, `LlmProvider.chat`) |
| Dependency inversion | The orchestrator depends on `IntentClassifier` and `Tool`, not on concrete classes or vendors |
