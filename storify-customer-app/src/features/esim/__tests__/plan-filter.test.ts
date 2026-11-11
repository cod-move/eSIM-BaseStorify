import { chooseFilter, filterPlans, openValues } from '../plan-filter';

const plans = [
  { id: 'a', facets: { days: ['1'], data: ['1GB'], operator: ['Docomo'] } },
  { id: 'b', facets: { days: ['7'], data: ['1GB'], operator: ['Docomo', 'KDDI'] } },
  { id: 'c', facets: { days: ['7'], data: ['5GB'], operator: ['SoftBank'] } },
];

describe('plan filters', () => {
  it('keeps the plans that have every chosen value', () => {
    expect(filterPlans(plans, { days: '7' }).map((plan) => plan.id)).toEqual(['b', 'c']);
    expect(filterPlans(plans, { days: '7', operator: 'KDDI' }).map((plan) => plan.id)).toEqual([
      'b',
    ]);
    expect(filterPlans(plans, {}).map((plan) => plan.id)).toEqual(['a', 'b', 'c']);
  });

  it('offers what the other filters leave open', () => {
    expect([...openValues(plans, { days: '1' }, 'data')]).toEqual(['1GB']);
    expect([...openValues(plans, { days: '1' }, 'days')].sort()).toEqual(['1', '7']);
  });

  it('clears a choice no plan has with the new one', () => {
    expect(chooseFilter(plans, { data: '5GB' }, 'days', '1')).toEqual({ days: '1' });
    expect(chooseFilter(plans, { data: '1GB' }, 'days', '7')).toEqual({ data: '1GB', days: '7' });
    expect(chooseFilter(plans, { data: '1GB', days: '7' }, 'days', undefined)).toEqual({
      data: '1GB',
    });
  });
});
