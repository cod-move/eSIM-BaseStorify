import { renderHook } from '@testing-library/react-native';

import { ApiError, NetworkError } from '@/api/errors';
import { useConfig } from '@/features/config/use-config';

import { isGone, opensOnWebsite, useWebFallback } from '../web-fallback';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/features/config/use-config', () => ({ useConfig: jest.fn() }));

const WEBSITE = 'https://shop.test/bn/';

function withWebsite(websiteUrl: string | undefined) {
  // The hook reads only the website's address; the rest of the query result is not its business.
  jest.mocked(useConfig).mockReturnValue({
    data: websiteUrl === undefined ? undefined : { store: { websiteUrl } },
  } as ReturnType<typeof useConfig>);
}

const routeNotFound = new ApiError(404, 'ROUTE_NOT_FOUND', 'No such route');
const notTheStore = new ApiError(404, 'INVALID_RESPONSE', '');
const webOnly = new ApiError(404, 'NOT_FOUND', 'Website only', { reason: 'WEB_ONLY' });
const hidden = new ApiError(404, 'NOT_FOUND', 'Not available');

describe('which failures open the website instead', () => {
  it('opens the website for a store without the endpoint, or a page only it can show', () => {
    expect(opensOnWebsite(routeNotFound)).toBe(true);
    expect(opensOnWebsite(notTheStore)).toBe(true);
    expect(opensOnWebsite(webOnly)).toBe(true);
  });

  it('keeps a hidden page, a language the store does not serve and any other failure', () => {
    expect(opensOnWebsite(hidden)).toBe(false);
    expect(opensOnWebsite(new ApiError(404, 'LOCALE_NOT_AVAILABLE', ''))).toBe(false);
    expect(opensOnWebsite(new ApiError(500, 'INTERNAL_ERROR', ''))).toBe(false);
    expect(opensOnWebsite(new NetworkError('offline'))).toBe(false);
    expect(opensOnWebsite(null)).toBe(false);
  });

  it('calls a hidden page gone, and nothing the website shows', () => {
    expect(isGone(hidden)).toBe(true);
    expect(isGone(webOnly)).toBe(false);
    expect(isGone(routeNotFound)).toBe(false);
  });
});

describe('useWebFallback', () => {
  beforeEach(() => mockReplace.mockClear());

  it("puts the website's page in place of the screen, at the same path", async () => {
    withWebsite(WEBSITE);
    const { result } = await renderHook(() => useWebFallback('/faq', routeNotFound, 'FAQ'));
    expect(result.current).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/web',
      params: { url: 'https://shop.test/bn/faq', title: 'FAQ' },
    });
  });

  it('does nothing for a page that is simply not there', async () => {
    withWebsite(WEBSITE);
    const { result } = await renderHook(() => useWebFallback('/privacy', hidden));
    expect(result.current).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does nothing before the store's address is known", async () => {
    withWebsite(undefined);
    const { result } = await renderHook(() => useWebFallback('/blog/x', routeNotFound));
    expect(result.current).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
