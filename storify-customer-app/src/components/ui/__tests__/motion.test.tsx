import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { cardRevealAt, revealAt, tabAnimation, useReveal } from '../motion';

const FIRST_EIGHT = Array.from({ length: 8 }, (_, index) => index);

describe('the reveal of a list', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('staggers the first eight items, a step each, and shows the rest at once', () => {
    const steps = FIRST_EIGHT.map((index) => revealAt(index, false));

    expect(steps.every((step) => step !== undefined)).toBe(true);
    expect(new Set(steps).size).toBe(8);
    expect(revealAt(8, false)).toBeUndefined();
    expect(revealAt(40, false)).toBeUndefined();
  });

  it('plays once: rows mounted after the first moment (a page, a scroll, a recycled cell) show at once', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useReveal());
    expect(result.current(0)).toBeDefined();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current(0)).toBeUndefined();
  });

  it('starts its moment when the list first shows, not while the screen loads', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(
      (props: { shown: boolean }) => useReveal(props.shown),
      {
        initialProps: { shown: false },
      }
    );

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current(0)).toBeDefined();

    await rerender({ shown: true });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current(0)).toBeUndefined();
  });
});

describe('the reveal of a grid of product cards', () => {
  const grid = { revealed: new Set(['shown']), columns: 2, reduceMotion: false };

  it('reveals each product once: a product already shown never rises again', () => {
    expect(cardRevealAt('shown', 0, { ...grid, firstMoment: true })).toBeUndefined();
    expect(cardRevealAt('shown', 30, { ...grid, firstMoment: false })).toBeUndefined();
    expect(cardRevealAt('new', 0, { ...grid, firstMoment: true })).toEqual({
      step: revealAt(0, false),
      waits: false,
    });
  });

  it('waits for a card scrolled into view, and staggers its row by column, the row start first', () => {
    const later = { ...grid, firstMoment: false };
    const start = cardRevealAt('a', 20, later);
    const end = cardRevealAt('b', 21, later);

    expect(start?.waits).toBe(true);
    expect(start?.step.animationDelay).toBe(0);
    expect(end?.step.animationDelay).toBeGreaterThan(0);
    expect(cardRevealAt('c', 22, later)?.step).toBe(start?.step);
  });
});

describe('with reduce motion on', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('animates nothing: no reveal, no stagger, no crossfade between tabs', async () => {
    expect(FIRST_EIGHT.map((index) => revealAt(index, true))).toEqual(
      FIRST_EIGHT.map(() => undefined)
    );
    expect(
      cardRevealAt('new', 20, {
        revealed: new Set(),
        columns: 2,
        firstMoment: false,
        reduceMotion: true,
      })
    ).toBeUndefined();
    expect(tabAnimation(true)).toBe('none');
    expect(tabAnimation(false)).toBe('fade');

    const { result } = await renderHook(() => useReveal());
    await waitFor(() => expect(result.current(0)).toBeUndefined());
  });
});
