import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {validatePrivateCarouselJpeg} from '../lib/private-image-carousel-jpeg.ts';

const image = ({width = 1080, height = 1350} = {}) => sharp({
  create: {width, height, channels: 3, background: '#113355'},
});
const profile = {quality: 92, chromaSubsampling: '4:4:4', progressive: false};

test('conserva o JPEG no perfil do compositor e recusa imagens fora do contrato', async () => {
  const jpeg = await image().withIccProfile('srgb').jpeg(profile).toBuffer();
  assert.equal(await validatePrivateCarouselJpeg(jpeg), true);
  const invalid = await Promise.all([
    image({width: 1024}).withIccProfile('srgb').jpeg(profile).toBuffer(),
    image().withIccProfile('srgb').jpeg({...profile, progressive: true}).toBuffer(),
    image().withIccProfile('srgb').jpeg({...profile, chromaSubsampling: '4:2:0'}).toBuffer(),
    image().withIccProfile('p3').jpeg(profile).toBuffer(),
    image().jpeg(profile).toBuffer(),
    image().png().toBuffer(),
  ]);
  invalid.push(Buffer.concat([jpeg.subarray(0, jpeg.length - 200), Buffer.from([255, 217])]));
  for (const bytes of invalid) assert.equal(await validatePrivateCarouselJpeg(bytes), false);
});
