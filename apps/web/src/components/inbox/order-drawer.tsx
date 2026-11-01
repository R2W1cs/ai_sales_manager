"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Phone,
  ShoppingBag,
  Check,
  X,
  Plus,
  Flame,
  FileText,
  AlertCircle,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stack } from "@/components/ui/stack";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ConversationSummaryDto, CreateDraftOrderDto, ConversationNoteDto } from "@app/shared";

export interface OrderDrawerProps {
  conversation: ConversationSummaryDto | null;
  businessId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmOrder: (paymentCompleted?: boolean) => Promise<unknown>;
  onCreateDraftOrder: (data: CreateDraftOrderDto) => Promise<unknown>;
  onCancelOrder: (orderId: string) => Promise<void>;
  className?: string;
}

interface DrawerHeaderProps {
  onClose: () => void;
}

function DrawerHeader({ onClose }: DrawerHeaderProps): React.ReactElement {
  const tInbox = useTranslations("inbox");
  const tCommon = useTranslations("common");

  return (
    <Stack
      direction="row"
      justify="between"
      className="h-14 shrink-0 border-b border-border bg-muted/20 px-4 py-2"
    >
      <h3 className="text-sm font-semibold text-foreground">{tInbox("customerContext")}</h3>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        aria-label={tCommon("close")}
      >
        <X className="size-4" />
      </Button>
    </Stack>
  );
}

interface DrawerTabsNavProps {
  activeTab: "order" | "customer" | "notes";
  setActiveTab: (tab: "order" | "customer" | "notes") => void;
  notesCount: number;
}

function DrawerTabsNav({
  activeTab,
  setActiveTab,
  notesCount,
}: DrawerTabsNavProps): React.ReactElement {
  const tOrders = useTranslations("orders");
  const tInbox = useTranslations("inbox");

  return (
    <Stack
      direction="row"
      size="xs"
      wrap={false}
      className="border-b border-border px-4 text-xs font-medium"
    >
      <button
        type="button"
        onClick={() => setActiveTab("order")}
        className={cn(
          "flex items-center gap-1.5 border-b-2 py-2.5 transition-colors",
          activeTab === "order"
            ? "border-primary font-semibold text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <ShoppingBag className="size-3.5" />
        <span>{tOrders("orderAndLeadTab")}</span>
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("customer")}
        className={cn(
          "ms-3 flex items-center gap-1.5 border-b-2 py-2.5 transition-colors",
          activeTab === "customer"
            ? "border-primary font-semibold text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <User className="size-3.5" />
        <span>{tInbox("customerDossier")}</span>
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("notes")}
        className={cn(
          "ms-3 flex items-center gap-1.5 border-b-2 py-2.5 transition-colors",
          activeTab === "notes"
            ? "border-primary font-semibold text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <FileText className="size-3.5" />
        <span>{tInbox("internalNotesCount", { count: notesCount })}</span>
      </button>
    </Stack>
  );
}

interface CustomerSummaryCardProps {
  customer: ConversationSummaryDto["customer"];
  channel: string;
}

function CustomerSummaryCard({ customer, channel }: CustomerSummaryCardProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3.5 shadow-2xs">
      <Stack direction="row" justify="between" className="w-full">
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {tInbox("clientLabel")}
        </span>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
          {channel}
        </span>
      </Stack>

      <div className="text-sm font-semibold text-foreground">
        {customer.name || tInbox("unnamedCustomer")}
      </div>

      {customer.phone ? (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">{customer.phone}</span>
          <a
            href={`tel:${customer.phone}`}
            aria-label={tInbox("callCustomer")}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Phone className="size-3" />
            <span>{tInbox("call")}</span>
          </a>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">{tInbox("noPhoneNumber")}</p>
      )}
    </div>
  );
}

interface LeadScoreCardProps {
  temperature: ConversationSummaryDto["leadTemperature"];
  score: number;
  titleKey?: "leadScoreTitle" | "intentIndex";
}

function LeadScoreCard({
  temperature,
  score,
  titleKey = "leadScoreTitle",
}: LeadScoreCardProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3.5 shadow-2xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {tInbox(titleKey)}
        </span>
        <div className="flex items-center gap-1">
          <Flame
            className={cn(
              "size-3.5",
              temperature === "hot"
                ? "fill-destructive text-destructive"
                : temperature === "warm"
                  ? "fill-warning text-warning"
                  : "text-muted-foreground",
            )}
          />
          <span className="text-xs font-bold text-foreground">{score}/100</span>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            temperature === "hot"
              ? "bg-destructive"
              : temperature === "warm"
                ? "bg-warning"
                : "bg-muted-foreground",
          )}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{tInbox("leadScoreDesc")}</p>
    </div>
  );
}

interface OrderActionsState {
  paymentCompleted: boolean;
  setPaymentCompleted: (checked: boolean) => void;
  isConfirming: boolean;
  isCancelling: boolean;
  handleConfirm: () => void;
  handleCancel: () => void;
}

interface NewOrderFormState {
  show: boolean;
  setShow: (show: boolean) => void;
  itemName: string;
  setItemName: (name: string) => void;
  quantity: number;
  setQuantity: (qty: number) => void;
  unitPrice: string;
  setUnitPrice: (price: string) => void;
  isDrafting: boolean;
  handleCreateDraft: () => void;
}

interface OrderDeskCardProps {
  pendingOrder: ConversationSummaryDto["pendingOrder"];
  orderActions: OrderActionsState;
  formState: NewOrderFormState;
}

function PendingOrderSection({
  pendingOrder,
  orderActions,
}: {
  pendingOrder: NonNullable<ConversationSummaryDto["pendingOrder"]>;
  orderActions: OrderActionsState;
}): React.ReactElement {
  const tOrders = useTranslations("orders");

  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
        <div className="flex justify-between font-medium">
          <span className="text-muted-foreground">{tOrders("statusLabel")}</span>
          <span className="text-foreground">{tOrders("statusPending")}</span>
        </div>
        <div className="flex justify-between border-t border-border/50 pt-1 text-sm font-bold">
          <span>{tOrders("totalToCollect")}</span>
          <span className="font-bold text-primary">{pendingOrder.total} DT</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id="paid-checkbox"
          checked={orderActions.paymentCompleted}
          onCheckedChange={(checked) => orderActions.setPaymentCompleted(Boolean(checked))}
        />
        <Label htmlFor="paid-checkbox" className="cursor-pointer text-xs font-normal">
          {tOrders("paymentCollectedLabel")}
        </Label>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button
          type="button"
          variant="default"
          size="sm"
          loading={orderActions.isConfirming}
          onClick={orderActions.handleConfirm}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Check className="me-1.5 size-4" />
          <span>{tOrders("confirmOrder")}</span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={orderActions.isCancelling}
          onClick={orderActions.handleCancel}
          className="w-full text-xs text-destructive hover:bg-destructive/10"
        >
          <X className="me-1 size-3.5" />
          <span>{tOrders("cancelOrder")}</span>
        </Button>
      </div>
    </div>
  );
}

function NewOrderFormSection({ formState }: { formState: NewOrderFormState }): React.ReactElement {
  const tOrders = useTranslations("orders");
  const tCommon = useTranslations("common");

  return (
    <div className="space-y-2.5 rounded-md border border-input p-3 text-xs">
      <div className="font-semibold text-foreground">{tOrders("createDraftOrderTitle")}</div>

      <div>
        <Label className="text-[11px] text-muted-foreground">{tOrders("itemOrDescLabel")}</Label>
        <Input
          value={formState.itemName}
          onChange={(e) => formState.setItemName(e.target.value)}
          placeholder={tOrders("itemOrDescPlaceholder")}
          className="mt-1 h-8 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">{tOrders("quantity")}</Label>
          <Input
            type="number"
            min={1}
            value={formState.quantity}
            onChange={(e) => formState.setQuantity(Number(e.target.value))}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">{tOrders("unitPriceTnd")}</Label>
          <Input
            value={formState.unitPrice}
            onChange={(e) => formState.setUnitPrice(e.target.value)}
            className="mt-1 h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => formState.setShow(false)}
          className="h-7 text-xs"
        >
          {tCommon("cancel")}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          loading={formState.isDrafting}
          onClick={formState.handleCreateDraft}
          className="h-7 text-xs"
        >
          {tOrders("createDraftButton")}
        </Button>
      </div>
    </div>
  );
}

function OrderDeskCard({
  pendingOrder,
  orderActions,
  formState,
}: OrderDeskCardProps): React.ReactElement {
  const tOrders = useTranslations("orders");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3.5 shadow-2xs">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {tOrders("pendingOrder")}
        </span>
        {pendingOrder ? (
          <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
            {tOrders("statusPendingBadge")}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">{tOrders("noActiveOrder")}</span>
        )}
      </div>

      {pendingOrder ? (
        <PendingOrderSection pendingOrder={pendingOrder} orderActions={orderActions} />
      ) : formState.show ? (
        <NewOrderFormSection formState={formState} />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => formState.setShow(true)}
          className="w-full text-xs"
        >
          <Plus className="me-1 size-3.5" />
          <span>{tOrders("createManualOrderButton")}</span>
        </Button>
      )}
    </div>
  );
}

interface CustomerDossierTabContentProps {
  conversation: ConversationSummaryDto;
  notesCount: number;
}

function CustomerDossierTabContent({
  conversation,
  notesCount,
}: CustomerDossierTabContentProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div className="flex-1 space-y-4 p-4">
      <div className="space-y-3 rounded-lg border border-border bg-background p-3.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase">
            {tInbox("contactDossier")}
          </span>
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
            {tInbox("channelLabel")} {conversation.channel}
          </span>
        </div>

        <div className="text-base font-semibold text-foreground">
          {conversation.customer.name || tInbox("unnamedCustomer")}
        </div>

        {conversation.customer.phone ? (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-muted-foreground">
              {conversation.customer.phone}
            </span>
            <a
              href={`tel:${conversation.customer.phone}`}
              aria-label={tInbox("callCustomer")}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Phone className="size-3" />
              <span>{tInbox("call")}</span>
            </a>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">{tInbox("noPhoneNumber")}</p>
        )}

        <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>{tInbox("conversationStatusLabel")}</span>
            <span className="font-semibold text-foreground">{conversation.status}</span>
          </div>
          <div className="flex justify-between">
            <span>{tInbox("savedInternalNotesLabel")}</span>
            <span className="font-semibold text-foreground">{notesCount}</span>
          </div>
        </div>
      </div>

      <LeadScoreCard
        temperature={conversation.leadTemperature}
        score={conversation.leadScore}
        titleKey="intentIndex"
      />
    </div>
  );
}

interface NotesTabContentProps {
  notes: ConversationNoteDto[];
  newNoteBody: string;
  setNewNoteBody: (body: string) => void;
  isAddingNote: boolean;
  isLoadingNotes: boolean;
  handleAddNote: () => void;
}

function NotesTabContent({
  notes,
  newNoteBody,
  setNewNoteBody,
  isAddingNote,
  isLoadingNotes,
  handleAddNote,
}: NotesTabContentProps): React.ReactElement {
  const tInbox = useTranslations("inbox");

  return (
    <div className="flex flex-1 flex-col space-y-3 p-4">
      <div className="space-y-2">
        <textarea
          value={newNoteBody}
          onChange={(e) => setNewNoteBody(e.target.value)}
          placeholder={tInbox("addNotePlaceholder")}
          rows={3}
          className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="default"
            size="sm"
            loading={isAddingNote}
            disabled={!newNoteBody.trim()}
            onClick={handleAddNote}
            className="h-7 text-xs"
          >
            {tInbox("addNote")}
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pt-2">
        {isLoadingNotes ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{tInbox("loadingNotes")}</p>
        ) : notes.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {tInbox("noCustomerNotes")}
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="space-y-1 rounded-lg border border-border bg-muted/30 p-2.5 text-xs"
            >
              <p className="whitespace-pre-wrap text-foreground">{note.body}</p>
              <span className="block text-[10px] text-muted-foreground">
                {new Date(note.createdAt).toLocaleString("fr-FR", { timeZone: "UTC" })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function OrderDrawer({
  conversation,
  businessId,
  isOpen,
  onClose,
  onConfirmOrder,
  onCreateDraftOrder,
  onCancelOrder,
  className,
}: OrderDrawerProps): React.ReactElement {
  const tOrders = useTranslations("orders");

  const [activeTab, setActiveTab] = useState<"order" | "customer" | "notes">("order");
  const [paymentCompleted, setPaymentCompleted] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [showNewOrderForm, setShowNewOrderForm] = useState<boolean>(false);

  const [itemName, setItemName] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<string>("50.000");
  const [isDrafting, setIsDrafting] = useState<boolean>(false);

  const [notes, setNotes] = useState<ConversationNoteDto[]>([]);
  const [newNoteBody, setNewNoteBody] = useState<string>("");
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState<boolean>(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  const [orderActionError, setOrderActionError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1280px)");
    const handler = () => setIsDesktop(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!conversation?.id || !businessId) {
      return undefined;
    }

    let mounted = true;
    queueMicrotask(() => {
      if (mounted) setIsLoadingNotes(true);
    });

    apiClient
      .get<ConversationNoteDto[]>(`/api/v1/conversations/${conversation.id}/notes`, {
        headers: { "x-business-id": businessId },
      })
      .then((res) => {
        if (mounted) {
          setNotes(res || []);
          setIsLoadingNotes(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setNotes([]);
          setIsLoadingNotes(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [conversation?.id, businessId]);

  if (!conversation) {
    return <div className="hidden" />;
  }

  async function handleConfirm() {
    setIsConfirming(true);
    setOrderActionError(null);
    try {
      await onConfirmOrder(paymentCompleted);
      setIsConfirming(false);
    } catch (err: unknown) {
      setOrderActionError((err as Error)?.message || tOrders("confirmOrderError"));
      setIsConfirming(false);
    }
  }

  async function handleCancel() {
    if (!conversation?.pendingOrder) return;

    setIsCancelling(true);
    setOrderActionError(null);
    try {
      await onCancelOrder(conversation.pendingOrder.id);
      setIsCancelling(false);
    } catch (err: unknown) {
      setOrderActionError((err as Error)?.message || tOrders("cancelOrderError"));
      setIsCancelling(false);
    }
  }

  async function handleCreateDraft() {
    if (!itemName.trim() || quantity <= 0) return;

    setIsDrafting(true);
    setOrderActionError(null);
    try {
      const draftDto: CreateDraftOrderDto = {
        customerId: conversation?.customer.id,
        items: [
          {
            variantId: crypto.randomUUID(),
            quantity: Math.max(1, Number(quantity)),
          },
        ],
        currency: "TND",
        deliveryFee: 7.0,
      };

      await onCreateDraftOrder(draftDto);
      setShowNewOrderForm(false);
      setItemName("");
      setQuantity(1);
      setIsDrafting(false);
    } catch (err: unknown) {
      setOrderActionError((err as Error)?.message || tOrders("createDraftError"));
      setIsDrafting(false);
    }
  }

  async function handleAddNote() {
    if (!newNoteBody.trim() || isAddingNote) return;

    setIsAddingNote(true);
    try {
      const createdNote = await apiClient.post<ConversationNoteDto>(
        `/api/v1/conversations/${conversation!.id}/notes`,
        { body: newNoteBody.trim() },
        {
          headers: { "x-business-id": businessId },
        },
      );
      setNotes((prev) => [createdNote, ...prev]);
      setNewNoteBody("");
      setIsAddingNote(false);
    } catch {
      setIsAddingNote(false);
    }
  }

  const drawerContent = (
    <div className="flex h-full flex-col overflow-y-auto bg-card text-foreground">
      <DrawerHeader onClose={onClose} />

      <DrawerTabsNav activeTab={activeTab} setActiveTab={setActiveTab} notesCount={notes.length} />

      {orderActionError && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{orderActionError}</span>
        </div>
      )}

      {activeTab === "order" && (
        <div className="flex-1 space-y-4 p-4">
          <CustomerSummaryCard customer={conversation.customer} channel={conversation.channel} />
          <LeadScoreCard
            temperature={conversation.leadTemperature}
            score={conversation.leadScore}
          />
          <OrderDeskCard
            pendingOrder={conversation.pendingOrder}
            orderActions={{
              paymentCompleted,
              setPaymentCompleted,
              isConfirming,
              isCancelling,
              handleConfirm,
              handleCancel,
            }}
            formState={{
              show: showNewOrderForm,
              setShow: setShowNewOrderForm,
              itemName,
              setItemName,
              quantity,
              setQuantity,
              unitPrice,
              setUnitPrice,
              isDrafting,
              handleCreateDraft,
            }}
          />
        </div>
      )}

      {activeTab === "customer" && (
        <CustomerDossierTabContent conversation={conversation} notesCount={notes.length} />
      )}

      {activeTab === "notes" && (
        <NotesTabContent
          notes={notes}
          newNoteBody={newNoteBody}
          setNewNoteBody={setNewNoteBody}
          isAddingNote={isAddingNote}
          isLoadingNotes={isLoadingNotes}
          handleAddNote={handleAddNote}
        />
      )}
    </div>
  );

  return (
    <>
      {/* Desktop inline pane (xl and above: 1280px+) */}
      <aside
        data-slot="order-drawer-desktop"
        className={cn(
          "hidden h-full w-80 shrink-0 border-s border-border xl:flex xl:flex-col",
          isOpen ? "xl:flex" : "xl:hidden",
          className,
        )}
      >
        {drawerContent}
      </aside>

      {/* Mobile & Tablet sheet overlay (< 1280px) */}
      <DialogPrimitive.Root open={isOpen && !isDesktop} onOpenChange={(open) => !open && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-background/80 backdrop-blur-xs xl:hidden" />
          <DialogPrimitive.Popup
            data-slot="order-drawer-sheet"
            className="fixed inset-e-0 top-0 z-50 flex h-full w-84 max-w-[90vw] flex-col border-s border-border bg-card shadow-2xl focus:outline-none xl:hidden"
          >
            {drawerContent}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
