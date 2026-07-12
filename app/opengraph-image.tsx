import { ImageResponse } from 'next/og';

export const alt = 'Vivarium — a living catalogue of a personal library';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// EB Garamond (woff) from the Fontsource CDN — an elegant book serif for the
// wordmark. Wrapped so a CDN hiccup falls back to the default font, never breaks.
async function ebGaramond(weight: 500 | 700): Promise<ArrayBuffer> {
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond/files/eb-garamond-latin-${weight}-normal.woff`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${weight} ${res.status}`);
  return res.arrayBuffer();
}

export default async function OpengraphImage() {
  let fonts: { name: string; data: ArrayBuffer; weight: 500 | 700; style: 'normal' }[] | undefined;
  try {
    const [w500, w700] = await Promise.all([ebGaramond(500), ebGaramond(700)]);
    fonts = [
      { name: 'EB Garamond', data: w500, weight: 500, style: 'normal' },
      { name: 'EB Garamond', data: w700, weight: 700, style: 'normal' },
    ];
  } catch {
    fonts = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f4efe3',
          color: '#22282f',
          fontFamily: 'EB Garamond, serif',
          padding: 56,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: '#fbf8f0',
            border: '3px solid #e2dccb',
            borderRadius: 20,
            padding: '64px 96px',
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: 14, color: '#b1402f' }}>
            EX LIBRIS
          </div>
          <div style={{ fontSize: 150, fontWeight: 700, marginTop: 4, letterSpacing: -2 }}>Vivarium</div>
          <div style={{ width: 240, height: 3, background: '#b1402f', margin: '28px 0' }} />
          <div style={{ fontSize: 38, fontWeight: 500, color: '#4a4f56' }}>
            A living catalogue of a personal library
          </div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#6b7280', marginTop: 12, letterSpacing: 4 }}>
            books · art · instruments
          </div>
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) },
  );
}
