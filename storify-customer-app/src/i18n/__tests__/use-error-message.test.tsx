import { renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { NetworkError } from '@/api/errors';
import { getMessages } from '@/i18n/messages';

import { useErrorMessage } from '../use-error-message';

function EnglishProvider({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('useErrorMessage', () => {
  it('maps an offline NetworkError to the offline sentence', async () => {
    const { result } = await renderHook(() => useErrorMessage(), { wrapper: EnglishProvider });

    expect(result.current(new NetworkError('offline'))).toBe(
      'You are offline. Connect to the internet and try again.'
    );
  });

  it('maps a timeout to the timeout sentence and anything else to the generic one', async () => {
    const { result } = await renderHook(() => useErrorMessage(), { wrapper: EnglishProvider });

    expect(result.current(new NetworkError('timeout'))).toBe(
      'That took too long. Please try again.'
    );
    expect(result.current(new Error('boom'))).toBe(getMessages('en').errors.generic);
  });
});
