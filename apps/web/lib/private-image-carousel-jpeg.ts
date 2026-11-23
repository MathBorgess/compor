let canonicalSrgbProfile: Promise<Buffer | undefined> | undefined;

export async function validatePrivateCarouselJpeg(bytes: Uint8Array): Promise<boolean> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;

  const {default: sharp} = await import('sharp');
  try {
    const image = sharp(bytes, {limitInputPixels: 1080 * 1350, failOn: 'warning'});
    const meta = await image.metadata();
    if (meta.format !== 'jpeg' || meta.width !== 1080 || meta.height !== 1350
        || meta.space !== 'srgb' || !meta.icc || meta.isProgressive !== false
        || meta.chromaSubsampling !== '4:4:4' || (meta.orientation ?? 1) !== 1) return false;
    // The reported colour space can be sRGB even when an attached ICC is Display P3.
    canonicalSrgbProfile ??= sharp({create: {width: 1, height: 1, channels: 3, background: '#000000'}})
      .withIccProfile('srgb').jpeg().toBuffer()
      .then(profileImage => sharp(profileImage).metadata())
      .then(profileMeta => profileMeta.icc);
    if (!(await canonicalSrgbProfile)?.equals(meta.icc)) return false;
    // Reading the header alone does not prove that the compressed pixels decode.
    await image.raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}
