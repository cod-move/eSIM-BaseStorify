"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { CampaignView } from "@/lib/esim/campaigns/service";

/**
 * eSIM campaigns (CAT-11): each a page at /esim/campaign/<slug> with a
 * banner, the destinations on offer and a coupon code for its dates. Saving
 * keeps the Storify coupon in step; the code works only on those
 * destinations' eSIMs.
 */

interface DestinationOption {
  slug: string;
  name: string;
  scope: string;
}

interface Draft {
  id: string | null;
  slug: string;
  name: string;
  headline: string;
  description: string;
  imageUrl: string;
  seoTitle: string;
  seoDescription: string;
  destinations: string[];
  discountPercent: number;
  couponCode: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

/** A date as a datetime-local input shows it, in the admin's own time zone. */
const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

function blank(): Draft {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  return {
    id: null,
    slug: "",
    name: "",
    headline: "",
    description: "",
    imageUrl: "",
    seoTitle: "",
    seoDescription: "",
    destinations: [],
    discountPercent: 10,
    couponCode: "",
    startsAt: toLocalInput(start.toISOString()),
    endsAt: toLocalInput(new Date(start.getTime() + 14 * 86_400_000).toISOString()),
    active: false,
  };
}

function draftOf(campaign: CampaignView): Draft {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    headline: campaign.headline,
    description: campaign.description,
    imageUrl: campaign.imageUrl ?? "",
    seoTitle: campaign.seoTitle ?? "",
    seoDescription: campaign.seoDescription ?? "",
    destinations: campaign.destinations,
    discountPercent: campaign.discountPercent,
    couponCode: campaign.couponCode,
    startsAt: toLocalInput(campaign.startsAt),
    endsAt: toLocalInput(campaign.endsAt),
    active: campaign.status === "active",
  };
}

export function EsimCampaignsAdmin({
  campaigns,
  destinations,
  canManage,
}: {
  campaigns: CampaignView[];
  destinations: DestinationOption[];
  canManage: boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const nameOf = useMemo(() => new Map(destinations.map((destination) => [destination.slug, destination.name])), [destinations]);
  const shown = destinations.filter((destination) => destination.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const when = (iso: string) => new Date(iso).toLocaleString();

  const stateLabel: Record<CampaignView["state"], string> = {
    draft: t("admin.esim.campaignDraft", "Draft"),
    scheduled: t("admin.esim.campaignScheduled", "Scheduled"),
    live: t("admin.esim.campaignLive", "Running"),
    ended: t("admin.esim.campaignEnded", "Ended"),
  };

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const body = {
        slug: draft.slug,
        name: draft.name,
        headline: draft.headline,
        description: draft.description,
        imageUrl: draft.imageUrl.trim() || null,
        seoTitle: draft.seoTitle.trim() || null,
        seoDescription: draft.seoDescription.trim() || null,
        destinations: draft.destinations,
        discountPercent: draft.discountPercent,
        couponCode: draft.couponCode,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        status: draft.active ? "active" : "draft",
      };
      if (draft.id) await apiClient.put(`/api/esim/admin/campaigns/${draft.id}`, body);
      else await apiClient.post("/api/esim/admin/campaigns", body);
      toast.success(t("admin.esim.saved", "Saved"));
      setDraft(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(campaign: CampaignView) {
    const ok = await confirm({
      title: t("admin.esim.confirm", "Are you sure?"),
      description: t("admin.esim.campaignConfirmDelete", "Remove this campaign? Its page goes, and its coupon code stops working."),
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/api/esim/admin/campaigns/${campaign.id}`);
      toast.success(t("admin.esim.campaignDeleted", "Campaign removed"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));
  const toggle = (slug: string, on: boolean) =>
    setDraft((current) =>
      current ? { ...current, destinations: on ? [...current.destinations, slug] : current.destinations.filter((entry) => entry !== slug) } : current,
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimCampaigns", "Campaigns")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "admin.esim.campaignsHint",
              "A campaign is a page with a banner and a coupon code for chosen destinations, for its dates. The code is a Storify coupon kept in step with the campaign, and works only on those destinations' eSIMs.",
            )}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setDraft(blank())}>
            <Plus className="mr-2 h-4 w-4" /> {t("admin.esim.campaignNew", "New campaign")}
          </Button>
        ) : null}
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("admin.esim.campaignNone", "No campaigns yet.")}</CardContent>
        </Card>
      ) : (
        campaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-6">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{campaign.name}</span>
                  <Badge variant={campaign.state === "live" ? "default" : "secondary"}>{stateLabel[campaign.state]}</Badge>
                  <Badge variant="outline" className="font-mono">{campaign.couponCode} · −{campaign.discountPercent}%</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {when(campaign.startsAt)} – {when(campaign.endsAt)} ·{" "}
                  {t("admin.esim.campaignUsed", "used {count} times", { count: campaign.used })}
                </div>
                <div className="text-sm">{campaign.destinations.map((slug) => nameOf.get(slug) ?? slug).join(", ")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {campaign.state === "live" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/esim/campaign/${campaign.slug}`} target="_blank">
                      <ExternalLink className="mr-2 h-4 w-4" /> {t("admin.esim.campaignView", "View page")}
                    </Link>
                  </Button>
                ) : null}
                {canManage ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDraft(draftOf(campaign))}>
                      <Pencil className="mr-2 h-4 w-4" /> {t("admin.esim.edit", "Edit")}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(campaign)}>
                      <Trash2 className="mr-2 h-4 w-4" /> {t("admin.esim.campaignDelete", "Remove")}
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("admin.esim.campaignEdit", "Edit campaign") : t("admin.esim.campaignNew", "New campaign")}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-name">{t("admin.esim.campaignName", "Name")}</Label>
                  <Input
                    id="campaign-name"
                    value={draft.name}
                    maxLength={100}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraft((current) => (current ? { ...current, name, slug: current.id || current.slug !== slugify(current.name) ? current.slug : slugify(name) } : current));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-slug">{t("admin.esim.campaignSlug", "Page address")}</Label>
                  <Input id="campaign-slug" value={draft.slug} maxLength={60} onChange={(event) => set("slug", slugify(event.target.value))} />
                  <p className="text-xs text-muted-foreground">/esim/campaign/{draft.slug || "…"}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-headline">{t("admin.esim.campaignHeadline", "Banner headline")}</Label>
                <Input id="campaign-headline" value={draft.headline} maxLength={140} onChange={(event) => set("headline", event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-description">{t("admin.esim.campaignDescription", "Description")}</Label>
                <Textarea id="campaign-description" rows={3} value={draft.description} maxLength={1000} onChange={(event) => set("description", event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campaign-image">{t("admin.esim.campaignImage", "Banner image URL (optional)")}</Label>
                <Input id="campaign-image" type="url" value={draft.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} placeholder="https://…" />
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-code">{t("admin.esim.campaignCode", "Coupon code")}</Label>
                  <Input id="campaign-code" className="font-mono" value={draft.couponCode} maxLength={20} onChange={(event) => set("couponCode", event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-discount">{t("admin.esim.campaignDiscount", "Discount %")}</Label>
                  <Input
                    id="campaign-discount"
                    type="number"
                    min={1}
                    max={90}
                    value={draft.discountPercent}
                    onChange={(event) => set("discountPercent", Math.max(1, Math.min(90, Math.round(Number(event.target.value)) || 1)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-start">{t("admin.esim.campaignStarts", "Starts")}</Label>
                  <Input id="campaign-start" type="datetime-local" value={draft.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-end">{t("admin.esim.campaignEnds", "Ends")}</Label>
                  <Input id="campaign-end" type="datetime-local" value={draft.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("admin.esim.campaignDestinations", "Destinations")} ({draft.destinations.length})
                </Label>
                <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("admin.esim.campaignFind", "Find a destination")} />
                <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                  {shown.map((destination) => (
                    <label key={destination.slug} className="flex items-center gap-2">
                      <Checkbox checked={draft.destinations.includes(destination.slug)} onCheckedChange={(on) => toggle(destination.slug, on === true)} />
                      <span>{destination.name}</span>
                      {destination.scope !== "local" ? <span className="text-xs text-muted-foreground">{destination.scope}</span> : null}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-seo-title">{t("admin.esim.campaignSeoTitle", "SEO title (optional)")}</Label>
                  <Input id="campaign-seo-title" value={draft.seoTitle} maxLength={70} onChange={(event) => set("seoTitle", event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-seo-description">{t("admin.esim.campaignSeoDescription", "SEO description (optional)")}</Label>
                  <Input id="campaign-seo-description" value={draft.seoDescription} maxLength={320} onChange={(event) => set("seoDescription", event.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <Switch checked={draft.active} onCheckedChange={(active) => set("active", active)} />
                {t("admin.esim.campaignActive", "Active: the page and the code work between the dates")}
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={save} disabled={busy || !draft?.name || !draft?.slug || !draft?.couponCode || !draft?.destinations.length}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
