import { uploadName } from '../upload-name';

describe('upload name', () => {
  it('keeps an ASCII name', () => {
    expect(uploadName('application/pdf', 'invoice-2026.pdf')).toBe('invoice-2026.pdf');
    expect(uploadName('image/jpeg', 'IMG_20261113.jpg')).toBe('IMG_20261113.jpg');
  });

  it('replaces any other name, keeping its extension', () => {
    expect(uploadName('image/jpeg', '微信图片_20261113.jpg')).toBe('photo.jpg');
    expect(uploadName('application/pdf', '合同.pdf')).toBe('document.pdf');
    expect(uploadName('image/png', 'say "hi".png')).toBe('photo.png');
  });

  it('names one without a name from its type', () => {
    expect(uploadName('image/jpeg')).toBe('photo.jpg');
    expect(uploadName('image/webp', null)).toBe('photo.webp');
    expect(uploadName('image/heic', '照片')).toBe('photo.heic');
  });
});
