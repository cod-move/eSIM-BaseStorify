import { render, screen } from '@testing-library/react-native';

import { Skeleton, SkeletonText } from '../skeleton';

// A skeleton is hidden from screen readers, so the queries have to look at hidden elements too.
const hidden = { includeHiddenElements: true };

describe('Skeleton', () => {
  it('is a grey shape of the size the screen gives it', async () => {
    await render(<Skeleton className="size-12 rounded-full" />);

    const shape = screen.getByTestId('skeleton', hidden);
    expect(shape.props.className).toContain('bg-surface-alt');
    expect(shape.props.className).toContain('size-12');
    expect(shape.props.className).toContain('rounded-full');
    // The shape's own `rounded-md` gives way to the one asked for.
    expect(shape.props.className).not.toContain('rounded-md');
  });

  it('says nothing to a screen reader', async () => {
    await render(<Skeleton className="h-4 w-24" />);

    const shape = screen.getByTestId('skeleton', hidden);
    expect(shape.props.accessible).toBe(false);
    expect(shape.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });
});

describe('SkeletonText', () => {
  it('draws the lines it stands for, the last one shorter', async () => {
    await render(<SkeletonText lines={4} />);

    const lines = screen.getAllByTestId('skeleton', hidden);
    expect(lines).toHaveLength(4);
    expect(lines.slice(0, 3).every((line) => line.props.className.includes('w-full'))).toBe(true);
    expect(lines[3]?.props.className).toContain('w-2/3');
    expect(lines[3]?.props.className).not.toContain('w-full');
  });

  it('draws one full line for one line', async () => {
    await render(<SkeletonText lines={1} />);

    expect(screen.getByTestId('skeleton', hidden).props.className).toContain('w-full');
  });

  it('draws three lines unless told otherwise', async () => {
    await render(<SkeletonText />);

    expect(screen.getAllByTestId('skeleton', hidden)).toHaveLength(3);
  });
});
