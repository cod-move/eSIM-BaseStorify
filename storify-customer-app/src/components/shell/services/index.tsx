import { OfflineBanner } from './offline-banner';
import { PushService } from './push-service';
import { RatingPrompt } from './rating-prompt';
import { UpdateCheck } from './update-check';

/**
 * What runs for the whole app, under every screen, once: mounted by the root
 * layout. Each service draws nothing or draws over the screens itself.
 */
export function ShellServices() {
  return (
    <>
      <PushService />
      <OfflineBanner />
      <UpdateCheck />
      <RatingPrompt />
    </>
  );
}
