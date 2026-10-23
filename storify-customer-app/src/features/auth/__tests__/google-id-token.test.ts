import { GoogleOneTapSignIn, type OneTapResponse } from 'react-native-nitro-google-signin';

import { env } from '@/config/env';

import { canUseGoogleSignIn, requestGoogleIdToken } from '../google-id-token';

const picker = jest.mocked(GoogleOneTapSignIn.presentExplicitSignIn);

const success: OneTapResponse = {
  type: 'success',
  data: {
    idToken: 'google.id.token',
    user: {
      id: '1',
      email: 'gina@example.com',
      name: 'Gina',
      givenName: null,
      familyName: null,
      photo: null,
    },
    scopes: [],
    serverAuthCode: null,
  },
};

describe('requestGoogleIdToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks Google with the store's web client and the app's iOS client, and keeps no Google session", async () => {
    jest.replaceProperty(env, 'googleIosClientId', '123-ios.apps.googleusercontent.com');
    picker.mockResolvedValueOnce(success);

    await expect(requestGoogleIdToken('123-web.apps.googleusercontent.com')).resolves.toEqual({
      type: 'token',
      token: 'google.id.token',
      email: 'gina@example.com',
    });
    expect(GoogleOneTapSignIn.configure).toHaveBeenCalledWith({
      webClientId: '123-web.apps.googleusercontent.com',
      iosClientId: '123-ios.apps.googleusercontent.com',
    });
    expect(GoogleOneTapSignIn.signOut).toHaveBeenCalled();
  });

  it('reads a closed picker, and a second tap while it is open, as a cancel', async () => {
    picker.mockResolvedValueOnce({ type: 'cancelled', data: null });
    await expect(requestGoogleIdToken('web')).resolves.toEqual({ type: 'cancelled' });

    picker.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'IN_PROGRESS' }));
    await expect(requestGoogleIdToken('web')).resolves.toEqual({ type: 'cancelled' });

    picker.mockRejectedValueOnce(Object.assign(new Error('closed'), { code: 'SIGN_IN_CANCELLED' }));
    await expect(requestGoogleIdToken('web')).resolves.toEqual({ type: 'cancelled' });
  });

  it('tells a phone with no Google account from a failure', async () => {
    picker.mockResolvedValueOnce({ type: 'noSavedCredentialFound', data: null });
    await expect(requestGoogleIdToken('web')).resolves.toEqual({ type: 'noAccount' });

    picker.mockRejectedValueOnce(
      Object.assign(new Error('bad client'), { code: 'DEVELOPER_ERROR' })
    );
    await expect(requestGoogleIdToken('web')).resolves.toEqual({ type: 'failed' });

    jest
      .mocked(GoogleOneTapSignIn.checkPlayServices)
      .mockRejectedValueOnce(
        Object.assign(new Error('old'), { code: 'PLAY_SERVICES_NOT_AVAILABLE' })
      );
    await expect(requestGoogleIdToken('web')).resolves.toEqual({ type: 'failed' });
  });
});

describe('canUseGoogleSignIn', () => {
  it('needs the iOS client compiled in on iOS', () => {
    jest.replaceProperty(env, 'googleIosClientId', null);
    expect(canUseGoogleSignIn()).toBe(false);

    jest.replaceProperty(env, 'googleIosClientId', '123-ios.apps.googleusercontent.com');
    expect(canUseGoogleSignIn()).toBe(true);
  });
});
