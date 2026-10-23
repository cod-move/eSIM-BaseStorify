import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { useCameraPermissions, type PermissionResponse } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { changeMockProduct } from '@/api/mocks/routes/products';
import { SAME_CODE_PAUSE_MS } from '@/features/products/scanner/use-scanner';

import { readBarcode } from './camera';
import './hooks';
import './preload-app';
import { openApp, openTab, press, settle, signInOnScreen, tap, type } from './screens';

async function openScanner(email = 'admin@example.com'): Promise<void> {
  await openApp();
  await signInOnScreen(email);
  await openTab('Products');
  await press('Scan a barcode');
  await settle();
  await screen.findByRole('header', { name: 'Scan a barcode' });
}

/**
 * The camera's permission as a test sets it (`status` as expo-camera words it:
 * "undetermined", "denied"); `granted` again after the test.
 */
function cameraPermission(permission: { status: string; canAskAgain: boolean }) {
  const hook = jest.mocked(useCameraPermissions);
  const original = hook.getMockImplementation();
  const response = { granted: false, expires: 'never', ...permission } as PermissionResponse;
  const ask = jest.fn(async () => response);
  hook.mockReturnValue([response, ask, jest.fn()]);
  return { ask, restore: () => hook.mockImplementation(original) };
}

/**
 * The camera's permission as the phone's Settings hold it, `change`d by a test
 * as the operator would change it there. Like expo-camera's hook, the screen
 * sees a change only when it reads the permission again (the hook's third
 * function).
 */
function cameraSettings(permission: { status: string; canAskAgain: boolean; granted?: boolean }) {
  const hook = jest.mocked(useCameraPermissions);
  const original = hook.getMockImplementation();
  const responseOf = (next: typeof permission) =>
    ({ granted: false, expires: 'never', ...next }) as PermissionResponse;
  let held = responseOf(permission);
  function useHeldPermission(): ReturnType<typeof useCameraPermissions> {
    const [shown, setShown] = useState(held);
    const read = useCallback(async () => {
      setShown(held);
      return held;
    }, []);
    return [shown, read, read];
  }
  hook.mockImplementation(useHeldPermission);
  return {
    change: (next: typeof permission) => {
      held = responseOf(next);
    },
    restore: () => hook.mockImplementation(original),
  };
}

/** The app comes back to the front, from the phone's Settings or another app. */
async function comeBackToTheFront(): Promise<void> {
  const listeners = jest
    .mocked(AppState.addEventListener)
    .mock.calls.filter(([event]) => event === 'change')
    .map(([, listener]) => listener);
  await act(async () => {
    listeners.forEach((listener) => listener('active'));
  });
  await settle();
}

/**
 * The barcode scanner (EAN-13, UPC-A, Code 128). The
 * camera is a stand-in that reports what a test reads; what is tested is what
 * the scanner does with a read.
 */
describe('the barcode scanner', () => {
  it('opens the one product a code finds, once, however often the camera reports it', async () => {
    const replace = jest.spyOn(router, 'replace');
    try {
      await openScanner();
      await readBarcode('4006381333931', { times: 5 });
      await settle();

      expect(await screen.findByRole('header', { name: 'Ceramic bud vase' })).toBeVisible();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('camera')).toBeNull();
    } finally {
      replace.mockRestore();
    }
  });

  it('opens a variant’s product with the variant that carries the code marked', async () => {
    await openScanner();
    await readBarcode('5901234123464');
    await settle();

    expect(await screen.findByRole('header', { name: 'Stoneware mug' })).toBeVisible();
    expect(screen.getByLabelText(/^Sand, Matches the scanned code, /)).toBeVisible();
    expect(screen.getAllByText('Matches the scanned code')).toHaveLength(1);
  });

  it('finds a UPC-A product the camera read as a 13-digit EAN', async () => {
    await openScanner();
    await readBarcode('0036000291452');
    await settle();

    expect(await screen.findByRole('header', { name: 'Linen tea towel (set of 2)' })).toBeVisible();
  });

  it('finds a Code 128 label typed in another case', async () => {
    await openScanner();
    await type('Or type the code', 'tote-cnv-01');
    await press('Find');
    await settle();

    expect(await screen.findByRole('header', { name: 'Canvas tote bag' })).toBeVisible();
  });

  it('says when no product has the code, and does not look it up again the moment it scans again', async () => {
    await openScanner();
    await readBarcode('9780201379624');
    await settle();
    expect(await screen.findByText('No product has the code 9780201379624')).toBeVisible();

    await press('Scan again');
    // The same label is still in front of the camera.
    await readBarcode('9780201379624');
    await settle();
    expect(screen.queryByText('No product has the code 9780201379624')).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(SAME_CODE_PAUSE_MS);
    });
    await readBarcode('9780201379624');
    await settle();
    expect(await screen.findByText('No product has the code 9780201379624')).toBeVisible();
  });

  it('lists every product carrying a code that is on more than one', async () => {
    changeMockProduct('prod_tote', (product) => {
      product.barcode = '4006381333931';
    });
    await openScanner();
    await readBarcode('4006381333931');
    await settle();

    expect(await screen.findByText('2 products have this code')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Ceramic bud vase,/ })).toBeVisible();
    await tap(screen.getByRole('button', { name: /^Canvas tote bag,/ }));
    await settle();
    expect(await screen.findByRole('header', { name: 'Canvas tote bag' })).toBeVisible();
  });

  it('only shows products in the operator’s reach', async () => {
    await openScanner('seller@example.com');
    // The store's own vase: not the seller's.
    await readBarcode('4006381333931');
    await settle();
    expect(await screen.findByText('No product has the code 4006381333931')).toBeVisible();

    await press('Scan again');
    await readBarcode('5901234123464');
    await settle();
    expect(await screen.findByRole('header', { name: 'Stoneware mug' })).toBeVisible();
  });

  it('asks for the camera when it may, and takes a typed code meanwhile', async () => {
    const permission = cameraPermission({ status: 'undetermined', canAskAgain: true });
    try {
      await openScanner();
      expect(screen.queryByTestId('camera')).toBeNull();
      expect(screen.getByText('Allow the camera')).toBeVisible();

      await press('Allow camera');
      expect(permission.ask).toHaveBeenCalledTimes(1);

      await type('Or type the code', 'VASE-01');
      await press('Find');
      await settle();
      expect(await screen.findByRole('header', { name: 'Ceramic bud vase' })).toBeVisible();
    } finally {
      permission.restore();
    }
  });

  it('says at once, offline, that a code could not be looked up, and looks it up again on Try again', async () => {
    await openScanner();
    await act(async () => onlineManager.setOnline(false));
    try {
      await type('Or type the code', 'VASE-01');
      await press('Find');
      await settle();

      expect(screen.getByText("Couldn't look up VASE-01")).toBeVisible();
      expect(screen.queryByText('Looking for VASE-01')).toBeNull();
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }

    await press('Try again');
    await settle();
    expect(await screen.findByRole('header', { name: 'Ceramic bud vase' })).toBeVisible();
  });

  it('turns the camera on when the operator comes back from allowing it in Settings', async () => {
    const settings = cameraSettings({ status: 'denied', canAskAgain: false });
    try {
      await openScanner();
      expect(screen.getByText('The camera is off for this app')).toBeVisible();
      expect(screen.queryByTestId('camera')).toBeNull();

      // Allowed in the phone's Settings, away from the app; then the app is in front again.
      settings.change({ status: 'granted', canAskAgain: true, granted: true });
      await comeBackToTheFront();

      expect(screen.getByTestId('camera')).toBeOnTheScreen();
      expect(screen.queryByText('The camera is off for this app')).toBeNull();
    } finally {
      settings.restore();
    }
  });

  it('sends the operator to Settings once the camera was refused for good', async () => {
    const permission = cameraPermission({ status: 'denied', canAskAgain: false });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    try {
      await openScanner();
      expect(screen.getByText('The camera is off for this app')).toBeVisible();

      await press('Open Settings');
      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(permission.ask).not.toHaveBeenCalled();
    } finally {
      openSettings.mockRestore();
      permission.restore();
    }
  });
});
