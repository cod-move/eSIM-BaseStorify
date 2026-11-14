import { installCodes } from '../install-codes';

describe('install codes', () => {
  it('shows the matching id and the whole LPA string', () => {
    expect(
      installCodes({ activationCode: 'LPA:1$rsp.example.com$ABC-123', smdpAddress: 'rsp.example.com', matchingId: 'ABC-123' }),
    ).toEqual({ activationCode: 'ABC-123', lpa: 'LPA:1$rsp.example.com$ABC-123' });
  });

  it('builds the LPA string when the code is only the matching id', () => {
    expect(installCodes({ activationCode: 'ABC-123', smdpAddress: 'rsp.example.com', matchingId: 'ABC-123' })).toEqual({
      activationCode: 'ABC-123',
      lpa: 'LPA:1$rsp.example.com$ABC-123',
    });
  });

  it('shows an LPA code once when there is no matching id', () => {
    expect(installCodes({ activationCode: 'LPA:1$rsp.example.com$XYZ' })).toEqual({
      activationCode: 'LPA:1$rsp.example.com$XYZ',
      lpa: null,
    });
  });

  it('no LPA string without one', () => {
    expect(installCodes({ activationCode: 'XYZ', smdpAddress: 'rsp.example.com' })).toEqual({ activationCode: 'XYZ', lpa: null });
  });
});
