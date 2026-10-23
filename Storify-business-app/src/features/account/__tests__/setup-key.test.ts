import { setupKeyOf } from '../two-step-screen';

describe('the setup key of an authenticator link', () => {
  it('is the secret of the link, decoded', () => {
    expect(setupKeyOf('otpauth://totp/Store:me%40x.com?secret=JBSWY3DPEHPK3PXP&issuer=Store')).toBe(
      'JBSWY3DPEHPK3PXP'
    );
    expect(setupKeyOf('otpauth://totp/Store:me?issuer=Store')).toBeNull();
  });
});
