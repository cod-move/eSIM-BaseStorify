import type { BarcodeType } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProductListItem } from '@/contracts/mobile/biz/v1';

import { useFindByCode } from '../use-products';

/**
 * What the scanner does with what the camera reads.
 *
 * A camera reports the same barcode many times a second, so one read is
 * looked up and the rest are ignored until the operator has seen the
 * outcome: one product opens it, several are listed, none says so. After
 * "Scan again" the code just looked up is ignored for a moment, as it is
 * usually still in front of the camera.
 *
 * The code goes to the store as read: the store cleans it up the way its
 * register does (a UPC-A read as a 13-digit EAN, letters in any case, dashes).
 */

/** EAN-13 and UPC-A (what products carry) and Code 128 (what a store prints for its own SKUs). */
export const SCANNED_TYPES: BarcodeType[] = ['ean13', 'upc_a', 'code128'];

/** How long the code just looked up is ignored after "Scan again". */
export const SAME_CODE_PAUSE_MS = 2500;

/** The longest code the store looks up (the contract's limit). */
const MAX_CODE_LENGTH = 64;

/** The code to look up, as read or typed; `null` for nothing, or more than the store takes. */
export function codeOf(data: string): string | null {
  const code = data.trim();
  return code && code.length <= MAX_CODE_LENGTH ? code : null;
}

/** What the scanner shows under the camera. */
export type ScanState =
  | { step: 'scanning' }
  | { step: 'looking'; code: string }
  | { step: 'none'; code: string }
  | { step: 'many'; code: string; products: ProductListItem[] }
  | { step: 'failed'; code: string; error: unknown };

/** What the reads so far say about the next one. */
type ReadGate = {
  /** A code is being looked up, or its outcome is on screen. */
  busy: boolean;
  /** The last code looked up, and when the camera may report it again. */
  last: { code: string; until: number } | null;
};

/** Whether a camera read is looked up. */
export function takesRead(gate: ReadGate, code: string, now: number): boolean {
  if (gate.busy) return false;
  return !(gate.last && gate.last.code === code && now < gate.last.until);
}

/**
 * The scanner's state and what drives it. `onFound` receives the one product
 * a code found, with the code; the screen opens it.
 */
export function useScanner(onFound: (product: ProductListItem, code: string) => void) {
  const find = useFindByCode();
  const [state, setState] = useState<ScanState>({ step: 'scanning' });
  // A ref, not state: the camera reports again before React has drawn the last read.
  const gate = useRef<ReadGate>({ busy: false, last: null });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const lookUp = useCallback(
    async (code: string) => {
      gate.current = { busy: true, last: { code, until: 0 } };
      setState({ step: 'looking', code });
      try {
        const products = await find(code);
        if (!mounted.current) return;
        // One: it opens, and the gate stays shut while the scanner leaves.
        if (products.length === 1) onFound(products[0]!, code);
        else setState(products.length ? { step: 'many', code, products } : { step: 'none', code });
      } catch (error) {
        if (mounted.current) setState({ step: 'failed', code, error });
      }
    },
    [find, onFound]
  );

  /** What the camera read. */
  const onRead = useCallback(
    (data: string) => {
      const code = codeOf(data);
      if (code && takesRead(gate.current, code, Date.now())) void lookUp(code);
    },
    [lookUp]
  );

  /** A code the operator typed: looked up unless a lookup is on its way. */
  const onTyped = useCallback(
    (text: string) => {
      const code = codeOf(text);
      if (code && state.step !== 'looking') void lookUp(code);
    },
    [lookUp, state.step]
  );

  /** Back to the camera. */
  const scanAgain = useCallback(() => {
    const last = gate.current.last;
    gate.current = {
      busy: false,
      last: last ? { code: last.code, until: Date.now() + SAME_CODE_PAUSE_MS } : null,
    };
    setState({ step: 'scanning' });
  }, []);

  /** The same code again, after a lookup that failed. */
  const retry = useCallback(() => {
    if (state.step === 'failed') void lookUp(state.code);
  }, [lookUp, state]);

  return { state, onRead, onTyped, scanAgain, retry };
}
