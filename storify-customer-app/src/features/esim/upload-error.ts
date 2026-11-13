import { isNetworkError } from '@/api/errors';
import { confirmOffline } from '@/lib/network';

/**
 * An upload whose connection was cut while the phone is online (patch P65).
 * The app's transport calls every lost connection "offline"; for a file the
 * usual cause is the server refusing it mid-way instead, most often a web
 * server's upload size limit (nginx's default is 1 MB), which closes the
 * connection rather than answering.
 */
export class UploadInterruptedError extends Error {
  constructor(cause: unknown) {
    super('The upload was cut off by the server', { cause });
    this.name = 'UploadInterruptedError';
  }
}

/** Runs an upload; a lost connection while the phone is online becomes an `UploadInterruptedError`. */
export async function explainUploadFailure<T>(upload: () => Promise<T>): Promise<T> {
  try {
    return await upload();
  } catch (error) {
    if (isNetworkError(error) && error.kind === 'offline' && !(await confirmOffline())) {
      throw new UploadInterruptedError(error);
    }
    throw error;
  }
}
