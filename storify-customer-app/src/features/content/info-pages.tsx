import { openURL } from 'expo-linking';
import { View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { type IconName } from '@/components/ui/icon';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import type {
  AboutPage,
  ContactLine,
  ContactPage,
  PageAction,
  PageClosing,
  PageSection,
  ReturnPolicyPage,
  StoreContact,
} from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

import { ArticleBody, ArticleScroll, ArticleTitle } from './article-parts';
import { ContactForm } from './contact-form';

type Refresh = { refreshing: boolean; onRefresh: () => void };

const open = (href: string) => void openURL(href).catch(() => undefined);

/** A heading of a part of the page, and the line under it. */
function Heading({ title, text }: { title: string; text?: string }) {
  return (
    <View className="gap-1">
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {text ? (
        <Text variant="body" className="text-muted">
          {text}
        </Text>
      ) : null}
    </View>
  );
}

/** A list of the page: steps, rules, milestones. */
function Section({ section }: { section?: PageSection }) {
  if (!section) return null;
  return (
    <View className="gap-3">
      {section.title ? <Heading title={section.title} text={section.text} /> : null}
      <View className="gap-3 rounded-2xl bg-surface p-4">
        {section.items.map((item) => (
          <View key={item.id} className="gap-1">
            {item.title ? <Text variant="subheading">{item.title}</Text> : null}
            {item.text ? (
              <Text variant="body" className="text-muted">
                {item.text}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The page's buttons, each following its website path as any link to the store does. */
function Actions({ actions }: { actions: (PageAction | undefined)[] }) {
  const openLink = useOpenLink();
  const shown = actions.filter((action): action is PageAction => Boolean(action));
  if (shown.length === 0) return null;
  return (
    <View className="gap-3">
      {shown.map((action, index) => (
        <Button
          key={action.path + action.label}
          label={action.label}
          variant={index === 0 ? 'primary' : 'outline'}
          onPress={() => openLink(action.path)}
        />
      ))}
    </View>
  );
}

function Closing({ closing }: { closing?: PageClosing }) {
  if (!closing) return null;
  return (
    <View className="gap-4 rounded-2xl bg-surface p-5">
      <Heading title={closing.title} text={closing.text} />
      <Actions actions={[closing.primaryAction, closing.secondaryAction]} />
    </View>
  );
}

function LineRow({ line, icon }: { line?: ContactLine; icon?: IconName }) {
  if (!line) return null;
  const href = line.href;
  return (
    <NavRow
      icon={icon}
      title={line.label}
      description={line.value}
      disabled={!href}
      onPress={href ? () => open(href) : undefined}
    />
  );
}

const SOCIAL_NAMES: Partial<Record<string, string>> = {
  FACEBOOK: 'Facebook',
  TWITTER: 'X',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
  LINKEDIN: 'LinkedIn',
};

/** The store's address (on a map), email, phone, hours and profiles: a tap opens each. */
export function ContactDetails({ details }: { details: StoreContact }) {
  return (
    <>
      <RowGroup>
        <LineRow line={details.address} icon="pin" />
        <LineRow line={details.email} icon="mail" />
        <LineRow line={details.phone} icon="phone" />
        <LineRow line={details.hours} />
      </RowGroup>
      {details.social.length > 0 ? (
        <RowGroup>
          {details.social.map((link) => (
            <NavRow
              key={link.url}
              icon="globe"
              title={SOCIAL_NAMES[link.network] ?? link.url}
              onPress={() => open(link.url)}
            />
          ))}
        </RowGroup>
      ) : null}
    </>
  );
}

function Hero({ image }: { image?: AboutPage['image'] }) {
  if (!image) return null;
  return <AppImage image={image} size="full" className="aspect-video w-full rounded-2xl" />;
}

/** `/about`: the store's page, part by part, as the website shows it. */
export function AboutView({ page, refreshing, onRefresh }: { page: AboutPage } & Refresh) {
  return (
    <ArticleScroll refreshing={refreshing} onRefresh={onRefresh}>
      {page.eyebrow ? <Text variant="caption">{page.eyebrow}</Text> : null}
      <ArticleTitle title={page.headline} />
      {page.description ? (
        <Text variant="body" className="-mt-3 text-muted">
          {page.description}
        </Text>
      ) : null}
      <Hero image={page.image} />
      <Actions actions={[page.primaryAction, page.secondaryAction]} />
      {page.stats.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-3">
            {page.stats.map((stat) => (
              <View key={stat.id} className="min-w-28 flex-1 gap-1 rounded-2xl bg-surface p-4">
                <Text variant="heading">{stat.value}</Text>
                <Text variant="caption">{stat.label}</Text>
              </View>
            ))}
          </View>
          {page.statsFootnote ? <Text variant="caption">{page.statsFootnote}</Text> : null}
        </View>
      ) : null}
      {page.howItWorks ? (
        <View className="gap-4">
          <Heading title={page.howItWorks.title} text={page.howItWorks.text} />
          <Section section={page.howItWorks.shoppers} />
          <Section section={page.howItWorks.sellers} />
          <Actions actions={[page.howItWorks.sellers?.action]} />
          {page.howItWorks.protections.length > 0 ? (
            <Section section={{ title: '', items: page.howItWorks.protections }} />
          ) : null}
        </View>
      ) : null}
      {page.values ? (
        <Section
          section={{
            title: page.values.title,
            text: page.values.mission,
            items: page.values.items,
          }}
        />
      ) : null}
      {page.story ? (
        <View className="gap-3">
          <Heading title={page.story.title} />
          <ArticleBody html={page.story.html} />
        </View>
      ) : null}
      <Section section={page.milestones} />
      {page.team ? (
        <View className="gap-3">
          <Heading title={page.team.title} text={page.team.text} />
          {page.team.members.map((member) => {
            const url = member.url;
            return (
              <View key={member.id} className="flex-row gap-3 rounded-2xl bg-surface p-4">
                {member.image ? (
                  <AppImage image={member.image} size="thumb" className="size-14 rounded-full" />
                ) : null}
                <View className="flex-1 gap-1">
                  <Text variant="subheading">{member.name}</Text>
                  {member.role ? <Text variant="caption">{member.role}</Text> : null}
                  {member.bio ? (
                    <Text variant="body" className="text-muted">
                      {member.bio}
                    </Text>
                  ) : null}
                  {url ? (
                    <Button
                      label={member.name}
                      variant="ghost"
                      icon="link"
                      onPress={() => open(url)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {page.testimonials ? (
        <Section
          section={{
            title: page.testimonials.title,
            text: page.testimonials.text,
            items: page.testimonials.items.map((item) => ({
              id: item.id,
              title: item.reviewerName,
              text: item.comment,
            })),
          }}
        />
      ) : null}
      {page.contact ? (
        <View className="gap-3">
          <Heading title={page.contact.title} text={page.contact.text} />
          <ContactDetails details={page.contact.details} />
          <Actions actions={[page.contact.action]} />
        </View>
      ) : null}
      <Closing closing={page.closing} />
    </ArticleScroll>
  );
}

/** `/contact`: the ways to reach the store, and its form. */
export function ContactView({ page, refreshing, onRefresh }: { page: ContactPage } & Refresh) {
  const map = page.map;
  return (
    <ArticleScroll refreshing={refreshing} onRefresh={onRefresh}>
      <ArticleTitle title={page.title} />
      {page.description ? (
        <Text variant="body" className="-mt-3 text-muted">
          {page.description}
        </Text>
      ) : null}
      <Heading title={page.intro.title} text={page.intro.text} />
      <ContactDetails details={page.details} />
      <Heading title={page.form.title} text={page.form.text} />
      <ContactForm />
      {map ? (
        <View className="gap-3">
          <Heading title={map.title} text={map.text} />
          <Button
            label={map.label ?? map.title}
            variant="outline"
            icon="map"
            onPress={() => open(map.url)}
          />
        </View>
      ) : null}
    </ArticleScroll>
  );
}

/** `/returns`: the store's return policy. */
export function ReturnPolicyView({
  page,
  refreshing,
  onRefresh,
}: { page: ReturnPolicyPage } & Refresh) {
  return (
    <ArticleScroll refreshing={refreshing} onRefresh={onRefresh}>
      {page.eyebrow ? <Text variant="caption">{page.eyebrow}</Text> : null}
      <ArticleTitle title={page.title} />
      {page.description ? (
        <Text variant="body" className="-mt-3 text-muted">
          {page.description}
        </Text>
      ) : null}
      <View className="gap-2 rounded-2xl bg-surface p-4">
        <Text variant="caption">{page.window.label}</Text>
        <Text variant="heading">{page.window.value}</Text>
        {page.summary.map((line) => (
          <Text key={line} variant="body" className="text-muted">
            {line}
          </Text>
        ))}
      </View>
      <Actions actions={[page.primaryAction, page.secondaryAction]} />
      <Section section={page.howItWorks} />
      <Section section={page.eligible} />
      <Section section={page.excluded} />
      <Section section={page.refundRules} />
      <Section section={page.statuses} />
      {page.beforeReturn ? (
        <Heading title={page.beforeReturn.title} text={page.beforeReturn.text} />
      ) : null}
      {page.help.email || page.help.phone ? (
        <View className="gap-3">
          <Heading title={page.help.title} />
          <RowGroup>
            <LineRow line={page.help.email} icon="mail" />
            <LineRow line={page.help.phone} icon="phone" />
          </RowGroup>
        </View>
      ) : null}
      <Closing closing={page.closing} />
    </ArticleScroll>
  );
}
