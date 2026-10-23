import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useCan } from '@/features/workspace/use-workspace';

export function CreateOrderButton() {
  const t = useTranslations('orders.create');
  const can = useCan('CREATE_ORDERS');
  return can ? (
    <Button label={t('title')} size="sm" variant="ink" onPress={() => router.push('/orders/new')} />
  ) : null;
}
