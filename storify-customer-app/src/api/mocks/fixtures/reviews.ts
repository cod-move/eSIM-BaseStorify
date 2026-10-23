/** The mock store's data for: reviews of a product. */
import type { Review, ReviewSort, ReviewSummary } from '@/contracts/mobile/shop/v1';

import { SEEDS } from './products';
import { picture } from './shared';

const AUTHORS = ['Daniel Cooper', 'Amina Rahman', 'Lucas Martin', 'Sara Haddad', undefined];

const TEXTS: { title?: string; comment: string }[] = [
  {
    title: 'Exactly what I hoped for',
    comment:
      'Arrived quickly and well packed. It feels solid, looks better than the pictures and has held up well after a few weeks of daily use.',
  },
  {
    title: 'Good value',
    comment: 'Does the job. The finish could be a little better, but for the price I am happy.',
  },
  {
    comment: 'Second one I have bought. Still as good as the first.',
  },
  {
    title: 'Not quite right for me',
    comment:
      'The size runs a bit small, so check the guide before you order. Customer service answered within a day.',
  },
];

/** Mean zero, so the ratings land around the product's average. */
const SPREAD = [0.4, -0.4, 0.2, -0.2, 0.6, 0, -0.6, 0.3, -0.3, 0];

const DAY = 24 * 60 * 60 * 1000;
const NEWEST = Date.parse('2026-09-28T10:00:00Z');

/** Every approved review of the product, newest first. A product without a rating has none. */
export function productReviews(slug: string): Review[] | undefined {
  const seed = SEEDS.find((candidate) => candidate.slug === slug);
  if (!seed) return undefined;
  const [average, count] = seed.rating ?? [0, 0];

  return Array.from({ length: count }, (_, index): Review => {
    const text = TEXTS[index % TEXTS.length] ?? { comment: '' };
    const spread = SPREAD[index % SPREAD.length] ?? 0;
    const rating = Math.min(5, Math.max(1, Math.round(average + spread)));
    const photos = index % 3 === 0 ? (index % 2 === 0 ? 4 : 2) : 0;
    return {
      id: `${slug}-review-${index + 1}`,
      rating,
      title: text.title,
      comment: text.comment,
      author: { name: AUTHORS[index % AUTHORS.length] },
      verifiedPurchase: index % 4 !== 3,
      createdAt: new Date(NEWEST - index * 3 * DAY).toISOString(),
      images: Array.from({ length: photos }, (_, photo) =>
        picture(`${slug}-review-${index}-${photo}`, seed.name)
      ),
      reply:
        index % 7 === 0
          ? {
              comment:
                'Thank you for taking the time to write this. We are glad it arrived safely and hope you enjoy it for a long time.',
              createdAt: new Date(NEWEST - index * 3 * DAY + DAY).toISOString(),
            }
          : undefined,
    };
  });
}

/** What the store counts over every approved review, whatever the filter. */
export function summarize(reviews: Review[]): ReviewSummary {
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return {
    average: reviews.length ? Math.round((total / reviews.length) * 100) / 100 : 0,
    count: reviews.length,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: reviews.filter((review) => review.rating === stars).length,
    })),
  };
}

export function sortReviews(reviews: Review[], sort: ReviewSort): Review[] {
  const time = (review: Review) => Date.parse(review.createdAt);
  const sorted = [...reviews];
  if (sort === 'NEWEST') sorted.sort((a, b) => time(b) - time(a));
  if (sort === 'OLDEST') sorted.sort((a, b) => time(a) - time(b));
  if (sort === 'HIGHEST') sorted.sort((a, b) => b.rating - a.rating || time(b) - time(a));
  if (sort === 'LOWEST') sorted.sort((a, b) => a.rating - b.rating || time(b) - time(a));
  return sorted;
}
