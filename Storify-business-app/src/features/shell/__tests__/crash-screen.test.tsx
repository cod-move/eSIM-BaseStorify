import { fireEvent, render, screen } from '@testing-library/react-native';

import { ErrorBoundary } from '@/app/_layout';

describe('a screen that crashed', () => {
  it('is reported, said, and drawn again on "Try again"', async () => {
    const error = new Error('Cannot read properties of undefined');
    const retry = jest.fn(async () => {});
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(<ErrorBoundary error={error} retry={retry} />);

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    expect(report).toHaveBeenCalledWith(error);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    report.mockRestore();
  });
});
