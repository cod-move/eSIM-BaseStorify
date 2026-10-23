import { SAME_CODE_PAUSE_MS, codeOf, takesRead } from '../scanner/use-scanner';

describe('what the scanner looks up', () => {
  it('sends the code as read, only trimmed, within the store’s limit', () => {
    expect(codeOf(' 0036000291452\n')).toBe('0036000291452');
    expect(codeOf('tote-cnv-01')).toBe('tote-cnv-01');
    expect(codeOf('   ')).toBeNull();
    expect(codeOf('9'.repeat(65))).toBeNull();
  });

  it('takes one read at a time', () => {
    expect(takesRead({ busy: false, last: null }, '123', 0)).toBe(true);
    expect(takesRead({ busy: true, last: null }, '123', 0)).toBe(false);
  });

  it('ignores the code just looked up for a moment after "Scan again", and no other', () => {
    const gate = { busy: false, last: { code: '123', until: 1000 + SAME_CODE_PAUSE_MS } };
    expect(takesRead(gate, '123', 1000)).toBe(false);
    expect(takesRead(gate, '456', 1000)).toBe(true);
    expect(takesRead(gate, '123', 1000 + SAME_CODE_PAUSE_MS)).toBe(true);
  });
});
