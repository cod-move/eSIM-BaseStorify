import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth/use-session';
import { useWorkspace } from '@/features/workspace/use-workspace';

/**
 * An address the app has no screen for, or one the operator's capabilities
 * hide: the screen that is open to them now. Home exists only once a
 * workspace is open; before that, sign-in, the workspace choice or "no access".
 */
export default function NotFound() {
  const { isSignedIn } = useSession();
  const { status } = useWorkspace();

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (status === 'choose') return <Redirect href="/choose-workspace" />;
  if (status === 'none') return <Redirect href="/no-access" />;
  if (status === 'loading') return null;
  return <Redirect href="/" />;
}
