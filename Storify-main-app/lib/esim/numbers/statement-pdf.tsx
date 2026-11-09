import "server-only";

import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatAmount } from "@/lib/esim/numbers/line";
import { formatSeconds, formatTraffic, historyTotals } from "@/lib/esim/numbers/service-policy";
import type { StatementData, StatementMonthData } from "@/lib/esim/numbers/statement";

/**
 * A number's phone bill as a PDF: a summary of each month, then each
 * month's calls and texts, data sessions and credit added. In English, in
 * the app's bundled Inter font (as the order invoice), so it needs no
 * network to render.
 */

const font = (weight: 400 | 600) => ({ src: path.join(process.cwd(), "public", "fonts", "inter", `inter-${weight}.ttf`), fontWeight: weight });
Font.register({ family: "Inter", fonts: [font(400), font(600)] });

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 8.5, color: "#212B36", paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40 },
  title: { fontSize: 18, fontWeight: 600 },
  muted: { color: "#637381" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  section: { marginTop: 14 },
  heading: { fontSize: 11, fontWeight: 600, marginBottom: 6 },
  subheading: { fontSize: 9, fontWeight: 600, marginTop: 8, marginBottom: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DFE3E8", paddingVertical: 2.5 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#212B36", paddingBottom: 3, fontWeight: 600 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", color: "#919EAB", fontSize: 7.5 },
});

const day = (at: string | null) => (at ? at.slice(0, 19).replace("T", " ") : "—");
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

function Table({ columns, rows }: { columns: Array<{ label: string; width: string; right?: boolean }>; rows: string[][] }) {
  return (
    <View>
      <View style={styles.head}>
        {columns.map((column) => (
          <Text key={column.label} style={{ width: column.width, textAlign: column.right ? "right" : "left" }}>
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.row} wrap={false}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={{ width: columns[cellIndex].width, textAlign: columns[cellIndex].right ? "right" : "left" }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function totalsOf(month: StatementMonthData) {
  const totals = historyTotals(month.calls, month.data);
  const credit = month.recharges.reduce((sum, entry) => sum + (entry.amountMinor ?? 0), 0);
  return { ...totals, credit };
}

function StatementDocument({ data }: { data: StatementData }) {
  const money = (minor: number | null, currency?: string | null) => (minor === null ? "—" : formatAmount(minor, currency ?? data.currency));
  const first = data.months[0]?.month;
  const last = data.months[data.months.length - 1]?.month;
  return (
    <Document title={`Phone bill +${data.msisdn}`} author={data.storeName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Phone bill</Text>
            <Text style={styles.muted}>{data.storeName}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontWeight: 600 }}>+{data.msisdn}</Text>
            <Text style={styles.muted}>ICCID {data.iccid}</Text>
            <Text style={styles.muted}>{first === last ? monthName(first ?? "") : `${monthName(first ?? "")} – ${monthName(last ?? "")}`}</Text>
          </View>
        </View>
        <View>
          {data.customer.name ? <Text>{data.customer.name}</Text> : null}
          {data.customer.email ? <Text style={styles.muted}>{data.customer.email}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Summary</Text>
          <Table
            columns={[
              { label: "Month", width: "22%" },
              { label: "Calls", width: "12%", right: true },
              { label: "Texts", width: "12%", right: true },
              { label: "Data", width: "18%", right: true },
              { label: "Usage cost", width: "18%", right: true },
              { label: "Credit added", width: "18%", right: true },
            ]}
            rows={data.months.map((month) => {
              const totals = totalsOf(month);
              return [monthName(month.month), String(totals.calls), String(totals.texts), formatTraffic(totals.dataBytes), money(totals.costMinor), money(totals.credit)];
            })}
          />
        </View>

        {data.months.map((month) => (
          <View key={month.month} style={styles.section} break={data.months.length > 1}>
            <Text style={styles.heading}>{monthName(month.month)}</Text>
            <Text style={styles.subheading}>Calls and texts</Text>
            {month.calls.length ? (
              <Table
                columns={[
                  { label: "Date (UTC)", width: "22%" },
                  { label: "Type", width: "14%" },
                  { label: "Number", width: "20%" },
                  { label: "Destination", width: "20%" },
                  { label: "Length", width: "10%", right: true },
                  { label: "Cost", width: "14%", right: true },
                ]}
                rows={month.calls.map((entry) => [
                  day(entry.at),
                  `${entry.kind === "sms" ? "Text" : "Call"} ${entry.direction === "out" ? "out" : entry.direction === "in" ? "in" : ""}`.trim(),
                  (entry.direction === "out" ? entry.to : entry.from) ? `+${entry.direction === "out" ? entry.to : entry.from}` : "—",
                  entry.destination ?? "",
                  entry.kind === "call" ? formatSeconds(entry.seconds) : "",
                  money(entry.costMinor, entry.currency),
                ])}
              />
            ) : (
              <Text style={styles.muted}>None.</Text>
            )}
            <Text style={styles.subheading}>Data sessions</Text>
            {month.data.length ? (
              <Table
                columns={[
                  { label: "Date (UTC)", width: "24%" },
                  { label: "Network", width: "40%" },
                  { label: "Data", width: "18%", right: true },
                  { label: "Cost", width: "18%", right: true },
                ]}
                rows={month.data.map((entry) => [day(entry.at), [entry.operator, entry.country].filter(Boolean).join(", "), formatTraffic(entry.bytes), money(entry.costMinor, entry.currency)])}
              />
            ) : (
              <Text style={styles.muted}>None.</Text>
            )}
            <Text style={styles.subheading}>Credit added</Text>
            {month.recharges.length ? (
              <Table
                columns={[
                  { label: "Date (UTC)", width: "30%" },
                  { label: "How", width: "40%" },
                  { label: "Amount", width: "30%", right: true },
                ]}
                rows={month.recharges.map((entry) => [
                  day(entry.at),
                  entry.kind === "voucher" ? "Voucher" : entry.kind === "automatic" ? "Automatic top-up" : (entry.amountMinor ?? 0) < 0 ? "Credit moved out" : "Credit added",
                  money(entry.amountMinor, entry.currency),
                ])}
              />
            ) : (
              <Text style={styles.muted}>None.</Text>
            )}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>
            +{data.msisdn} · from the network's records, {day(data.createdAt)} UTC
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function numberStatementPdf(data: StatementData): Promise<Buffer> {
  return renderToBuffer(<StatementDocument data={data} />);
}
