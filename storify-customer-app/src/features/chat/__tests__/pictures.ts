import { screen } from '@testing-library/react-native';

type Node = NonNullable<typeof screen.root>;

/** The addresses of the pictures on screen: the host views that carry an image source. */
export function pictureUris(): string[] {
  const uris: string[] = [];
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return;
    const source: unknown = node.props.source;
    if (Array.isArray(source)) uris.push(String((source[0] as { uri?: string } | undefined)?.uri));
    node.children.forEach(visit);
  };
  if (screen.root) visit(screen.root);
  return uris;
}
