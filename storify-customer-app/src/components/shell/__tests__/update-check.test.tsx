import { render, waitFor } from '@testing-library/react-native';

import { UpdateCheck } from '../services/update-check';

const mockCheckForUpdate = jest.fn<Promise<{ isAvailable: boolean }>, []>();
const mockFetchUpdate = jest.fn<Promise<{ isNew: boolean }>, []>();
const mockReload = jest.fn<Promise<void>, []>();

jest.mock('expo-updates', () => ({
  isEnabled: true,
  updateId: null,
  checkForUpdateAsync: () => mockCheckForUpdate(),
  fetchUpdateAsync: () => mockFetchUpdate(),
  reloadAsync: () => mockReload(),
}));

function setDev(value: boolean) {
  Object.defineProperty(globalThis, '__DEV__', { value, configurable: true, writable: true });
}
describe('UpdateCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDev(false);
    mockCheckForUpdate.mockResolvedValue({ isAvailable: true });
    mockFetchUpdate.mockResolvedValue({ isNew: true });
  });

  it('checks once at cold start, downloads the update and never reloads the app', async () => {
    const screen = await render(<UpdateCheck />);
    await screen.rerender(<UpdateCheck />);

    await waitFor(() => expect(mockFetchUpdate).toHaveBeenCalledTimes(1));
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('downloads nothing when no update is waiting', async () => {
    mockCheckForUpdate.mockResolvedValue({ isAvailable: false });
    await render(<UpdateCheck />);

    await waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalledTimes(1));
    expect(mockFetchUpdate).not.toHaveBeenCalled();
  });

  it('does nothing in development', async () => {
    setDev(true);
    await render(<UpdateCheck />);

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });
});
