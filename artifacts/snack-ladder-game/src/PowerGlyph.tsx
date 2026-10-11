import type { SVGProps } from 'react';

export type DetailedPower = 'bomb' | 'antiVenom' | 'defuser' | 'webShooter' | 'knife';

export function PowerGlyph({
  power,
  size = 20,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { power: DetailedPower; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`power-glyph ${className ?? ''}`.trim()}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {power === 'bomb' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.4 7.4 11 5.5q.2-1.4 1.8-1.6l1.8-.2" stroke="#ffd38a" strokeWidth="1.5" />
          <path d="m14.5 2.9 1.1-1m-.1 2 1.5-.2m-2.2.9 1 1" stroke="#fff1a6" strokeWidth="1.2" />
          <path d="M9.2 7.2h5.2l.8 2.1a7.1 7.1 0 1 1-6.8.1z" fill="#292d35" stroke="#10141b" strokeWidth="1.2" />
          <path d="M6.8 11.2q5.1 2.5 10.3 0" stroke="#e9444d" strokeWidth="2" />
          <circle cx="10" cy="14.4" r="1.1" fill="#fff4d2" stroke="#fff4d2" strokeWidth=".5" />
          <circle cx="13.5" cy="14.4" r="1.1" fill="#fff4d2" stroke="#fff4d2" strokeWidth=".5" />
          <path d="m11 17.1 1 1 1-1" stroke="#fff4d2" strokeWidth="1.1" />
        </g>
      )}
      {power === 'antiVenom' && (
        <g strokeLinecap="round" strokeLinejoin="round" transform="rotate(-43 12 12)">
          <path d="M12 1.1v3.1" stroke="#f8fbff" strokeWidth="1.5" />
          <path d="M9.8 4.2h4.4l-.5 1.7h-3.4z" fill="#bdefff" stroke="#254b68" strokeWidth=".8" />
          <rect x="8.1" y="5.7" width="7.8" height="11.2" rx="1.2" fill="#f1fbff" stroke="#294a61" strokeWidth="1" />
          <path d="M9.1 10.1h5.8v5.6a.5.5 0 0 1-.5.5H9.6a.5.5 0 0 1-.5-.5z" fill="#f13b5b" />
          <path d="M9.2 9.4h5.6M9.8 11.1h1.5m2.1 1.6h1.2m-4.8 1.7h1.7" stroke="#a61f3a" strokeWidth=".8" />
          <path d="M7.2 17h9.6v1.8H7.2z" fill="#bdefff" stroke="#294a61" strokeWidth=".9" />
          <path d="M10 18.8v2.6h4v-2.6M12 21.4v1.5m-2.6 0h5.2" fill="none" stroke="#294a61" strokeWidth="1.2" />
          <path d="M12 22.9v.7" stroke="#e5f7ff" strokeWidth="1.2" />
        </g>
      )}
      {power === 'defuser' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9.2" cy="15.3" r="6.1" fill="#292d35" stroke="#11151d" strokeWidth="1.5" />
          <ellipse cx="7.2" cy="13.4" rx="2.1" ry="1.2" fill="#858b92" opacity=".7" transform="rotate(-35 7.2 13.4)" />
          <path d="m10.4 8.9 2.1-2.4 2.7.2 1.5 1.5-.2 2.7-2.4 2.1-2-2z" fill="#dce9ff" stroke="#37578c" strokeWidth="1.6" />
          <path d="m13.6 12.1 6.1 6.1q1.1 1.1 0 2.2t-2.2 0l-6.1-6.1" fill="#a9c8ff" stroke="#37578c" strokeWidth="1.7" />
          <path d="m14.4 7.4 1.3 1.3-1.2 1.2" stroke="#fff" strokeWidth="1.1" />
          <path d="m9.1 8.7 1.1-2.5 2.1-.6" stroke="#c7cbd0" strokeWidth="1.5" />
        </g>
      )}
      {power === 'knife' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.2 4.3 18 12l-6 6.7z" fill="#dceaff" stroke="#28354a" strokeWidth="1.3" />
          <path d="m3.4 4.9 13.1 6.5m-8 1 6.8 3.1" stroke="#fff" strokeWidth="1.2" />
          <path d="m13.8 16.5 4.1-4.2 3.4 3.4-4.1 4.1z" fill="#f0b94e" stroke="#573748" strokeWidth="1.2" />
          <path d="m17.1 19.1 3.5-3.5 2.1 2.1-2.4 4.2q-.6 1-1.5.4l-2-1.5q-.8-.7.3-1.7z" fill="#3c2c42" stroke="#211b2a" strokeWidth="1.3" />
          <path d="m18.3 20 2.5-2.5m-1.1 4.1 1.8-1.8" stroke="#d7bd99" strokeWidth=".8" />
        </g>
      )}
      {power === 'webShooter' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 20.5 6.7 21.5 13.6 16.7 18.1 7.3 18.1 2.5 13.6 3.5 6.7z" fill="#e8fbff" fillOpacity=".18" stroke="#f1fcff" strokeWidth="1.1" />
          <path d="M12 2 12 15.6M3.5 6.7 16.7 18.1M20.5 6.7 7.3 18.1M2.5 13.6 21.5 13.6M3.5 6.7 16 8.2 21.5 13.6M20.5 6.7 8 8.2 2.5 13.6" fill="none" stroke="#c8f3ff" strokeWidth=".65" />
          <path d="M12 2.8c-2.1 1.2-2.1 2.3 0 3.4 2.2 1.1 2.2 2.3 0 3.4-2.1 1.1-2.1 2.3 0 3.4 1.8 1 1.8 1.8.5 2.7" fill="none" stroke="#9cecff" strokeWidth=".7" />
          <path d="M12.5 18.1v1.1" stroke="#fff" strokeWidth=".9" />
          <ellipse cx="12.5" cy="20.4" rx="1.5" ry="1.8" fill="#ef4659" stroke="#781b35" strokeWidth=".7" />
          <circle cx="12.5" cy="18.9" r=".7" fill="#ff9a9e" stroke="#781b35" strokeWidth=".45" />
          <path d="m11.2 19.7-1-.8m1 2-.9.9m2.9-2.1 1-.8m-1 2 1 .9" stroke="#c92f4d" strokeWidth=".7" />
        </g>
      )}
    </svg>
  );
}
