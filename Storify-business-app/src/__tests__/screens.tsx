import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { MOCK_PASSWORD } from '@/api/mocks/server';

/**
 * What the screen tests share: the whole app from its root layout, on the
 * mock store, driven as an operator would drive it. Import `./hooks` too, for
 * a fresh store, cache and phone before each test.
 */

/** The app as `openApp` last rendered it: where it is now. */
let rendered: ReturnType<typeof renderRouter> | null = null;

/** The app, opened at `url` (Home by default). */
export async function openApp(url = '/'): Promise<void> {
  // Testing Library 14 renders asynchronously: what `renderRouter` returns is
  // the render's promise, with the router's helpers attached to it.
  rendered = renderRouter('./src/app', { initialUrl: url });
  await rendered;
}

/**
 * The route the app shows now (`/orders/ord_1`): where a tap led, without
 * depending on how that screen is titled.
 */
export function currentPath(): string {
  return rendered?.getPathname() ?? '';
}

/** Lets the mock store's answers and React Query's notifications through, under the fake timers. */
export async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
}

/**
 * Types into a field by the name a screen reader gives it. Await it: an event
 * is an act of its own (Testing Library 14), and one left running breaks the
 * next test's rendering.
 */
export async function type(label: string, text: string): Promise<void> {
  const fields = screen.getAllByLabelText(label);
  await fireEvent.changeText(fields[fields.length - 1]!, text);
}

/** Presses a button by its name. The last one wins: a screen under the current one keeps its own. */
export async function press(name: string): Promise<void> {
  const buttons = screen.getAllByRole('button', { name });
  await fireEvent.press(buttons[buttons.length - 1]!);
}

/** Presses an element found some other way. */
export async function tap(element: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await fireEvent.press(element);
}

/** Opens a tab by the start of its name ("Inbox" matches "Inbox, 2 unread"). */
export async function openTab(name: string): Promise<void> {
  const tab = screen
    .getAllByRole('tab')
    .find((candidate) => String(candidate.props.accessibilityLabel ?? '').startsWith(name));
  if (!tab) throw new Error(`No tab named ${name}`);
  await fireEvent.press(tab);
  await settle();
}

/** Signs in on the sign-in screen, with the mock store's password. */
export async function signInOnScreen(email: string): Promise<void> {
  await screen.findByRole('button', { name: 'Sign in' });
  await type('Email', email);
  await type('Password', MOCK_PASSWORD);
  await press('Sign in');
  await settle();
}

/** Opens the app and signs in as `email`: the tabs open on Home. */
export async function signIn(email = 'admin@example.com'): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await screen.findByRole('tab', { name: 'Home' });
}

/** Lets `ms` of the fake timers pass: a poll, a retry's pause, a toast. */
export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/** Lets a search field's pause pass (`useDebouncedValue`, 300 ms) and the list answer. */
export async function waitForSearch(): Promise<void> {
  await wait(400);
  await settle();
}

/** The names of the tabs the bar shows, in order. */
export function tabNames(): string[] {
  return screen.getAllByRole('tab').map((tab) => String(tab.props.accessibilityLabel ?? ''));
}

type Host = { props: Record<string, unknown>; children: (Host | string)[] };

/** Whether a host element hides what is inside it: a tab or a screen that is not the one shown. */
function hides(node: Host): boolean {
  const flat = [node.props.style].flat(Infinity) as ({ display?: string } | null | undefined)[];
  return (
    node.props.accessibilityElementsHidden === true ||
    node.props.importantForAccessibility === 'no-hide-descendants' ||
    flat.some((style) => style?.display === 'none')
  );
}

/**
 * Pulls to refresh what the screen shows: the shown list or page whose
 * refresh control the operator would pull. Await it, then read the screen.
 */
export async function pullToRefresh(): Promise<void> {
  const found: Host[] = [];
  const visit = (node: Host | string) => {
    if (typeof node === 'string' || hides(node)) return;
    // A scroll view carries its refresh control as a prop; a list hands it the handler.
    const control = node.props.refreshControl as Host | undefined;
    if (typeof control?.props.onRefresh === 'function') found.push(control);
    else if (typeof node.props.onRefresh === 'function') found.push(node);
    node.children.forEach(visit);
  };
  visit(screen.root as unknown as Host);
  const control = found[found.length - 1];
  if (!control) throw new Error('Nothing on screen pulls to refresh');
  await act(async () => {
    (control.props.onRefresh as () => void)();
  });
  await settle();
}
