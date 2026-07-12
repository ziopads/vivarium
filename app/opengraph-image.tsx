import { ImageResponse } from 'next/og';

export const alt = 'Vivarium — a living catalogue of a personal library';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// A bookplate-style link preview: parchment card, "Ex Libris", the wordmark.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#efe9dc',
          color: '#2a2420',
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
            background: '#f7f3ea',
            border: '3px solid #b7ac97',
            borderRadius: 20,
            padding: '64px 96px',
          }}
        >
          <div style={{ fontSize: 30, letterSpacing: 12, color: '#a24e33' }}>EX LIBRIS</div>
          <div style={{ fontSize: 132, fontWeight: 700, marginTop: 6, letterSpacing: -2 }}>Vivarium</div>
          <div style={{ width: 240, height: 3, background: '#a24e33', margin: '30px 0' }} />
          <div style={{ fontSize: 36, color: '#5b5348' }}>A living catalogue of a personal library</div>
          <div style={{ fontSize: 26, color: '#8a8073', marginTop: 12, letterSpacing: 4 }}>
            books · art · instruments
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
