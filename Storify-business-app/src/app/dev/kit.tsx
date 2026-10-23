import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Avatar, LogoTile } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Button, TextLink } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { IconButton } from '@/components/ui/icon-button';
import { IconCircle } from '@/components/ui/icon-circle';
import { PasswordField } from '@/components/ui/password-field';
import { Price } from '@/components/ui/price';
import {
  ActionRow,
  GroupFootnote,
  ListRow,
  NavRow,
  RowGroup,
  SectionLabel,
  ValueRow,
} from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { ConfirmSheet, PickerSheet, ReasonSheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, InlineError } from '@/components/ui/state-view';
import { StatusChip } from '@/components/ui/status-chip';
import { Text, type TextVariant } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Tile, TileGrid } from '@/components/ui/tile';
import { useToast } from '@/components/ui/toast';
import { GateScreen } from '@/features/config/gate-screen';
import { OrderStatusChip, PaymentStatusChip } from '@/features/status/status-chip';
import { useThemeStore } from '@/theme/theme-store';

/**
 * The component gallery: every piece of `components/ui` in its states, to
 * look at in light, dark and right to left (`/dev/kit`, development builds
 * only). Its words are samples, not the app's messages.
 */

const VARIANTS: TextVariant[] = [
  'display',
  'title-large',
  'title',
  'heading',
  'subheading',
  'body',
  'label',
  'price',
  'metric',
  'meta',
  'section',
  'caption',
  'status',
];

const money = (formatted: string) => ({ amount: 0, currency: 'BDT', formatted });

export default function Kit() {
  const toast = useToast();
  const theme = useThemeStore();
  const [tab, setTab] = useState<'needs_action' | 'shipped' | 'all'>('needs_action');
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('12');
  const [sheet, setSheet] = useState<'confirm' | 'picker' | 'reason' | null>(null);

  return (
    <Screen
      header={<StackHeader title="Component kit" />}
      scroll
      contentClassName="gap-8 px-4 pt-2">
      <Section title="Theme">
        <View className="flex-row flex-wrap gap-2">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              label={mode}
              variant={theme.choice === mode ? 'primary' : 'secondary'}
              onPress={() => theme.choose(mode)}
            />
          ))}
        </View>
      </Section>

      <Section title="Type">
        {VARIANTS.map((variant) => (
          <Text key={variant} variant={variant}>
            {variant} · ৳2,450.00 · 1042
          </Text>
        ))}
      </Section>

      <Section title="Buttons">
        <Button label="Primary" />
        <Button label="Mark shipped" variant="accent" icon="truck" />
        <Button label="Keep order" variant="secondary" />
        <Button label="Cancel order" variant="danger" />
        <Button label="Saving" variant="accent" loading />
        <Button label="Disabled" disabled />
        <View className="flex-row gap-3">
          <Button label="Small" size="sm" />
          <Button label="Ghost" variant="ghost" />
          <Button label="Sign out" variant="ghost" destructive />
        </View>
        <View className="flex-row items-center gap-3">
          <IconButton icon="arrow-left" label="Back" directional />
          <IconButton icon="scan-barcode" label="Scan" />
          <IconButton icon="bell" label="Notifications" count={3} />
          <IconButton icon="copy" label="Copy" variant="plain" />
          <TextLink label="Text link" />
        </View>
      </Section>

      <Section title="Status chips">
        <View className="flex-row flex-wrap gap-2">
          <StatusChip tone="neutral" label="Cancelled" />
          <StatusChip tone="info" label="Processing" />
          <StatusChip tone="success" label="Delivered" />
          <StatusChip tone="warning" label="Pending" />
          <StatusChip tone="danger" label="Expired" />
          <OrderStatusChip status="shipped" />
          <PaymentStatusChip status="partially_paid" />
          <OrderStatusChip status="on_hold" />
        </View>
      </Section>

      <Section title="Tiles">
        <TileGrid>
          <Tile
            icon="wallet"
            label="Collected today"
            value="৳12,450.00"
            wide
            onPress={() => undefined}
          />
          <Tile
            icon="wallet"
            label="Collected this month"
            value="৳1,24,500.00"
            wide
            onPress={() => undefined}
          />
          <Tile
            icon="package"
            tone="warning"
            label="Orders needing action"
            value="12"
            onPress={() => undefined}
          />
          <Tile icon="boxes" label="Low stock" value="0" onPress={() => undefined} />
          <Tile
            icon="inbox"
            tone="info"
            label="Unread messages"
            value="3"
            wide
            onPress={() => undefined}
          />
        </TileGrid>
      </Section>

      <Section title="Filter tabs and search">
        <View className="-mx-4 gap-3">
          <FilterTabs
            label="Order status"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'needs_action', label: 'Needs action', count: 12 },
              { value: 'shipped', label: 'Shipped' },
              { value: 'all', label: 'All' },
            ]}
          />
          <View className="flex-row items-center gap-2 px-4">
            <SearchField
              label="Order number or customer"
              value={search}
              onChangeText={setSearch}
              className="flex-1"
            />
            <IconButton icon="scan-barcode" label="Scan" />
          </View>
        </View>
      </Section>

      <Section title="Rows">
        <RowGroup>
          <ListRow
            accessibilityLabel="Order 1042"
            title="#1042"
            titleEnd={<Price money={money('৳2,450.00')} />}
            subtitle="Amina Rahman"
            meta="5 Oct, 10:42 · 3 items"
            metaEnd={<OrderStatusChip status="pending" />}
            onPress={() => undefined}
          />
          <ListRow
            accessibilityLabel="Order 1041"
            title="#1041"
            titleEnd={<Price money={money('৳980.00')} />}
            subtitle="Walk-in sale"
            meta="5 Oct, 09:10 · 1 item"
            metaEnd={
              <>
                <PaymentStatusChip status="pending" />
                <OrderStatusChip status="processing" />
              </>
            }
            onPress={() => undefined}
          />
        </RowGroup>
        <RowGroup divider="leading">
          <ListRow
            accessibilityLabel="Linen shirt"
            leading={<LogoTile icon="tag" size="md" />}
            title="Linen shirt, sand"
            titleEnd={<Price money={money('৳1,850.00')} />}
            meta="LS-SAND-M · 4 in stock"
            chevron
            onPress={() => undefined}
          />
          <ListRow
            accessibilityLabel="Rahim"
            leading={<Avatar name="Rahim Uddin" />}
            title="Rahim Uddin"
            titleEnd={<Text variant="caption">10:42</Text>}
            meta="Is the blue one back in stock?"
            emphasis
            onPress={() => undefined}
          />
        </RowGroup>
        <View>
          <SectionLabel title="Security" />
          <RowGroup>
            <NavRow icon="lock" title="Password" onPress={() => undefined} />
            <NavRow
              icon="shield"
              title="Two-step verification"
              value="On"
              onPress={() => undefined}
            />
            <ValueRow label="Payment" value="Paid by card" />
            <ActionRow icon="truck" title="Follow the parcel" onPress={() => undefined} />
            <ActionRow icon="sign-out" title="Sign out" destructive onPress={() => undefined} />
          </RowGroup>
          <GroupFootnote text="Your name and email are changed on the website." />
        </View>
      </Section>

      <Section title="Fields">
        <TextField
          label="Email"
          placeholder="you@example.com"
          value=""
          onChangeText={() => undefined}
        />
        <TextField
          label="Tracking number"
          value="TRK-1"
          error="Enter the tracking number."
          onChangeText={() => undefined}
        />
        <PasswordField
          label="New password"
          value="Password1"
          onChangeText={() => undefined}
          rules={[
            { label: 'At least 8 characters', met: true },
            { label: 'A special character', met: false },
          ]}
        />
        <CodeInput label="Authentication code" value={code} onChangeText={setCode} />
      </Section>

      <Section title="Banners">
        <Banner tone="warning" icon="wifi-off" message="You're offline. Changes can't be sent." />
        <Banner
          tone="warning"
          title="This shop is awaiting its first payment"
          message="Settle it on the website to open orders and payouts."
          action={{ label: 'Open the website', onPress: () => undefined }}
        />
        <Banner tone="danger" message="This app is for the people who run the store." />
        <Banner tone="info" message="Someone else changed this order. Check it and try again." />
      </Section>

      <Section title="Overlays">
        <View className="flex-row flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            label="Confirm sheet"
            onPress={() => setSheet('confirm')}
          />
          <Button
            size="sm"
            variant="secondary"
            label="Picker sheet"
            onPress={() => setSheet('picker')}
          />
          <Button
            size="sm"
            variant="secondary"
            label="Reason sheet"
            onPress={() => setSheet('reason')}
          />
          <Button
            size="sm"
            variant="secondary"
            label="Toast"
            onPress={() =>
              toast.show({
                message: 'Order 1042 marked shipped',
                tone: 'success',
                action: { label: 'Undo', onPress: () => undefined },
              })
            }
          />
        </View>
      </Section>

      <Section title="States">
        <View className="rounded-xl bg-surface">
          <EmptyState
            icon="package"
            title="No orders here"
            body="Orders that need action show up here."
            placement="top"
          />
        </View>
        <View className="rounded-xl bg-surface">
          <ErrorState error={new Error('x')} onRetry={() => undefined} />
        </View>
        <InlineError error={new Error('x')} onRetry={() => undefined} />
        <SkeletonRows rows={2} leading />
        <View className="flex-row gap-3">
          <IconCircle icon="check-circle" tone="success" size="lg" />
          <IconCircle icon="warning" tone="warning" size="lg" />
          <IconCircle icon="alert-circle" tone="danger" size="lg" />
        </View>
      </Section>

      <Section title="Gate screen">
        <View className="h-[600px] overflow-hidden rounded-xl border border-border">
          <GateScreen
            icon="refresh"
            tone="warning"
            title="Update the app"
            body="This version is no longer supported. Update the app to keep working."
            action={{ label: 'Update', onPress: () => undefined }}
            secondary={{ label: 'Not now', onPress: () => undefined }}
          />
        </View>
      </Section>

      <ConfirmSheet
        visible={sheet === 'confirm'}
        title="Cancel order #1042?"
        body="The customer is told. This can't be undone."
        confirmLabel="Cancel order"
        tone="danger"
        cancelLabel="Keep order"
        onConfirm={() => setSheet(null)}
        onCancel={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === 'picker'}
        title="Language"
        value="en"
        onChoose={() => undefined}
        onClose={() => setSheet(null)}
        options={[
          { value: 'en', title: 'English' },
          { value: 'bn', title: 'বাংলা', description: 'Bengali' },
          { value: 'ar', title: 'العربية', description: 'Arabic' },
        ]}
      />
      <ReasonSheet
        visible={sheet === 'reason'}
        title="Why cancel #1042?"
        body="The customer sees the reason."
        confirmLabel="Cancel order"
        tone="danger"
        cancelLabel="Keep order"
        noteLabel="Reason"
        otherValue="other"
        reasons={[
          { value: 'stock', title: 'Out of stock' },
          { value: 'customer', title: 'The customer asked' },
          { value: 'other', title: 'Other' },
        ]}
        onConfirm={() => setSheet(null)}
        onCancel={() => setSheet(null)}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}
