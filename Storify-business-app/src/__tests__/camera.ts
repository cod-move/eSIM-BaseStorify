import { act, screen } from '@testing-library/react-native';
import type { BarcodeScanningResult } from 'expo-camera';

/**
 * The camera of the scanner, as the screen tests drive it. `expo-camera` is a
 * view here (jest.setup.ts) that keeps the props it was given; reading a
 * barcode calls its `onBarcodeScanned`, `times` times in one go, as a real
 * camera reports the same code many times a second.
 */
export async function readBarcode(
  data: string,
  { type = 'ean13', times = 1 }: { type?: string; times?: number } = {}
): Promise<void> {
  const camera = screen.getByTestId('camera');
  const scanned = camera.props.onBarcodeScanned as
    ((result: BarcodeScanningResult) => void) | undefined;
  await act(async () => {
    for (let read = 0; read < times; read++) {
      scanned?.({
        type,
        data,
        cornerPoints: [],
        bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } },
      });
    }
  });
}
