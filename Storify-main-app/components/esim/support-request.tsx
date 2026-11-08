"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import type { SupportTopic, SupportTopicKind } from "@/lib/esim/account/support";

/**
 * "Contact support": pick an order, eSIM or number (or none), write, and the
 * message opens the shopper's thread with the store, naming the item; then
 * the inbox shows the thread. Storify's live chat carries it (no tickets).
 */

type Kind = SupportTopicKind | "other";
const KINDS: Kind[] = ["order", "esim", "number", "other"];

export function SupportRequestForm({ topics, initial }: { topics: SupportTopic[]; initial?: { kind: Kind; id?: string } }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initial?.kind ?? (topics.some((topic) => topic.kind === "order") ? "order" : "other"));
  const [id, setId] = useState(initial?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => topics.filter((topic) => topic.kind === kind), [topics, kind]);
  const topic = choices.find((entry) => entry.id === id) ?? null;
  const kindLabel = (value: Kind) =>
    value === "order"
      ? t("esim.support.kindOrder", "An order")
      : value === "esim"
        ? t("esim.support.kindEsim", "An eSIM")
        : value === "number"
          ? t("esim.support.kindNumber", "A number")
          : t("esim.support.kindOther", "Something else");
  const needsItem = kind !== "other";

  async function send() {
    const text = message.trim();
    if (!text || (needsItem && !topic)) return;
    setBusy(true);
    try {
      const prefix = topic ? `[${kind === "order" ? "Order" : kind === "esim" ? "eSIM" : "Number"} ${topic.reference}]` : "";
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prefix ? `${prefix}\n${text}` : text,
          subject: (prefix || text).slice(0, 180),
          clientMessageId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || t("esim.support.failed", "The message could not be sent"));
      const conversationId = payload.data?.conversation?._id as string | undefined;
      router.push(conversationId ? `/account/inbox?conversation=${encodeURIComponent(conversationId)}` : "/account/inbox");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>{t("esim.support.about", "What is it about?")}</Label>
          <div className="flex flex-wrap gap-2">
            {KINDS.filter((value) => value === "other" || topics.some((entry) => entry.kind === value)).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={kind === value ? "default" : "outline"}
                onClick={() => {
                  setKind(value);
                  setId("");
                }}
              >
                {kindLabel(value)}
              </Button>
            ))}
          </div>
        </div>
        {needsItem ? (
          <div className="space-y-1.5">
            <Label>{kindLabel(kind)}</Label>
            <Select value={id} onValueChange={setId}>
              <SelectTrigger aria-label={kindLabel(kind)}>
                <SelectValue placeholder={t("esim.support.choose", "Choose…")} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="support-message">{t("esim.support.message", "Your message")}</Label>
          <Textarea id="support-message" rows={6} maxLength={3800} value={message} onChange={(event) => setMessage(event.target.value)} />
        </div>
        <Button className="w-full sm:w-auto" disabled={busy || !message.trim() || (needsItem && !topic)} onClick={send}>
          {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
          {t("esim.support.send", "Send to support")}
        </Button>
      </CardContent>
    </Card>
  );
}
