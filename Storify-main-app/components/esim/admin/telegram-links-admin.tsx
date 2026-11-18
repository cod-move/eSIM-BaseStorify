"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatMb } from "@/lib/esim/telegram/format";
import type { AdminLinkRow, TelegramIdentity } from "@/lib/esim/telegram/service";

/** "@name" linking to their Telegram profile, else the first name, else the Telegram ID. */
export function TelegramName({ who }: { who: TelegramIdentity }) {
  if (who.username) {
    return (
      <a className="text-primary hover:underline" href={`https://t.me/${who.username}`} target="_blank" rel="noreferrer">
        @{who.username}
      </a>
    );
  }
  return <span>{who.firstName || `ID ${who.telegramUserId}`}</span>;
}

interface Props {
  links: { rows: AdminLinkRow[]; page: number; totalPages: number; total: number };
  search: string;
  canManage: boolean;
}

/**
 * The shoppers who linked Telegram: email, Telegram account, how and when it
 * was linked, check-ins and data held. Searchable by email, @username, name
 * or Telegram ID; an admin may unlink one (the data saved stays).
 */
export function TelegramLinksAdmin({ links, search: initialSearch, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const { confirm } = useConfirmation();
  const [search, setSearch] = useState(initialSearch);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const go = (q: string, page = 1) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  const unlink = async (row: AdminLinkRow) => {
    const ok = await confirm({
      title: t("admin.esim.telegramUnlinkTitle", "Unlink this Telegram account?"),
      description: t("admin.esim.telegramUnlinkBody", "{email} will need to link again before check-ins count. The data saved stays.", { email: row.email ?? row.userId }),
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(row.userId);
    try {
      await apiClient.delete(`/api/esim/admin/telegram/links/${row.userId}`);
      toast.success(t("admin.esim.telegramUnlinked", "Unlinked"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">
          {t("admin.esim.telegramLinkedList", "Linked accounts")} <span className="text-muted-foreground">({links.total})</span>
        </CardTitle>
        <form
          className="flex w-full max-w-sm items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            go(search);
          }}
        >
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.esim.telegramSearch", "Email, @username or Telegram ID")} />
          <Button type="submit" variant="outline" size="sm" disabled={isPending} aria-label={t("admin.esim.search", "Search")}>
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.esim.email", "Email")}</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>{t("admin.esim.telegramLinkedVia", "Linked")}</TableHead>
              <TableHead className="text-end">{t("admin.esim.telegramCheckins", "Check-ins")}</TableHead>
              <TableHead className="text-end">{t("admin.esim.telegramBalance", "Data held")}</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.rows.length ? (
              links.rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="text-xs">{row.email ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <TelegramName who={row} />
                    {row.username && row.firstName ? <span className="text-muted-foreground"> · {row.firstName}</span> : null}
                    <div className="text-muted-foreground">ID {row.telegramUserId}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="secondary">{row.via === "website" ? t("admin.esim.telegramViaWebsite", "website") : t("admin.esim.telegramViaEmail", "email code")}</Badge>
                    <div className="text-muted-foreground">{new Date(row.linkedAt).toLocaleString()}</div>
                  </TableCell>
                  <TableCell className="text-end text-xs">
                    {row.checkins}
                    {row.lastCheckinDay ? <div className="text-muted-foreground">{row.lastCheckinDay}</div> : null}
                  </TableCell>
                  <TableCell className="text-end text-xs">{formatMb(row.balanceMb)}</TableCell>
                  {canManage ? (
                    <TableCell className="text-end">
                      <Button variant="ghost" size="sm" onClick={() => unlink(row)} disabled={busy !== null}>
                        {t("admin.esim.telegramUnlink", "Unlink")}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="text-center text-sm text-muted-foreground">
                  {initialSearch ? t("admin.esim.telegramNoMatch", "No linked account matches.") : t("admin.esim.telegramNoLinks", "No one has linked Telegram yet.")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {links.totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2 pt-3 text-sm">
            <Button variant="outline" size="sm" disabled={links.page <= 1 || isPending} onClick={() => go(initialSearch, links.page - 1)}>
              ‹
            </Button>
            <span>
              {links.page} / {links.totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={links.page >= links.totalPages || isPending} onClick={() => go(initialSearch, links.page + 1)}>
              ›
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
