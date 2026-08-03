/**
 * Hand-drawn line illustrations for The Tax Network Group.
 * Original artwork from the design handoff — no licensing constraints.
 * Single stroke (#1F2433 deep navy, deliberately not --ink), slight hand wobble,
 * no fills or shading. Rendered inline (not <img>) so they scale cleanly and
 * keep crisp strokes on every display.
 */

const STROKE = '#1F2433';
const SW = 2.6; // primary stroke
const SW2 = 2; // secondary / motion lines
const common = `stroke="${STROKE}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

export type IllustrationName =
  | 'hero'
  | 'limited'
  | 'selfEmployed'
  | 'landlords'
  | 'inheritance'
  | 'advisory';

export const illustrations: Record<IllustrationName, string> = {
  hero: `
    <svg viewBox="0 0 800 760" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A figure considering documents and ideas held in balance">
      <g ${common}>
        <g transform="translate(180,180)">
          <path d="M-20,-14 q6,-10 22,-8 q14,2 16,12 q2,10 -8,16 q-12,6 -22,2 q-12,-4 -8,-22 z"/>
          <path d="M-2,-2 q4,-3 8,0 M0,6 q4,-2 8,1"/>
        </g>
        <g transform="translate(330,110)">
          <rect x="-22" y="-16" width="44" height="32" rx="2"/>
          <path d="M-14,-6 h28 M-14,2 h22 M-14,9 h18"/>
        </g>
        <g transform="translate(470,150)">
          <circle r="22"/>
          <path d="M-9,-2 h18 M-9,4 h18 M-3,-8 v18 M3,-8 v18"/>
        </g>
        <g transform="translate(580,220)">
          <rect x="-22" y="-16" width="44" height="32" rx="2"/>
          <path d="M-14,-6 h26 M-14,2 h20 M-14,9 h12"/>
        </g>
        <g transform="translate(620,360)">
          <circle r="20"/>
          <path d="M-7,-1 h14 M-7,5 h14 M-2,-7 v14 M2,-7 v14"/>
        </g>
        <g transform="translate(140,330)">
          <path d="M-22,-12 q4,-8 18,-6 q14,2 18,10 q2,10 -10,16 q-14,4 -22,-2 q-10,-8 -4,-18z"/>
          <path d="M-6,0 q4,-2 10,2"/>
        </g>
        <g transform="translate(400,330)">
          <ellipse cx="0" cy="50" rx="46" ry="48"/>
          <path d="M-44,40 q-2,-22 14,-34 q22,-16 50,-6 q22,8 24,30"/>
          <path d="M-12,98 v18 M12,98 v18"/>
          <path d="M-78,148 q-4,-22 28,-30 q26,-6 62,0 q34,8 30,32"/>
          <path d="M-72,148 q-4,80 8,160 M72,148 q4,80 -8,160"/>
          <path d="M-78,148 q-50,-30 -100,-90 q-12,-16 0,-26 q10,-8 22,4 q40,42 70,80"/>
          <path d="M78,148 q60,-30 110,-90 q12,-16 0,-26 q-10,-8 -22,4 q-40,42 -76,80"/>
          <path d="M-178,30 q-8,-2 -10,-12"/>
          <path d="M188,30 q8,-2 10,-12"/>
          <path d="M-20,308 q-6,40 -22,80"/>
          <path d="M20,308 q6,40 22,80"/>
          <path d="M-46,396 q-14,4 -22,12 q-2,4 4,6 q22,2 32,-6"/>
          <path d="M46,396 q14,4 22,12 q2,4 -4,6 q-22,2 -32,-6"/>
        </g>
      </g>
      <g stroke="${STROKE}" stroke-width="${SW2}" stroke-linecap="round" fill="none">
        <path d="M118,360 q-12,4 -22,12"/>
        <path d="M104,388 q-10,4 -16,10"/>
        <path d="M642,330 q12,4 22,12"/>
        <path d="M656,358 q10,4 16,10"/>
        <path d="M610,420 q10,8 14,16"/>
      </g>
    </svg>`,

  limited: `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Refined commercial building facade">
      <g ${common}>
        <path d="M60,520 h680"/>
        <path d="M170,520 v-340 h420 v340"/>
        <path d="M150,180 h460"/>
        <path d="M160,170 h440"/>
        <path d="M170,180 l210,-70 l210,70"/>
        <g>
          <path d="M210,520 v-300 M210,220 q-2,-6 8,-6 h0 q10,0 8,6 v300"/>
          <path d="M310,520 v-300 M310,220 q-2,-6 8,-6 h0 q10,0 8,6 v300"/>
          <path d="M410,520 v-300 M410,220 q-2,-6 8,-6 h0 q10,0 8,6 v300"/>
          <path d="M510,520 v-300 M510,220 q-2,-6 8,-6 h0 q10,0 8,6 v300"/>
        </g>
        <g stroke-width="${SW2}" opacity="0.7">
          <path d="M214,260 v240 M222,260 v240"/>
          <path d="M314,260 v240 M322,260 v240"/>
          <path d="M414,260 v240 M422,260 v240"/>
          <path d="M514,260 v240 M522,260 v240"/>
        </g>
        <path d="M150,520 h460 M140,540 h480 M130,560 h500"/>
        <path d="M360,520 v-90 q0,-20 20,-20 h0 q20,0 20,20 v90"/>
        <circle cx="380" cy="148" r="14"/>
        <path d="M366,148 h28 M380,134 v28"/>
      </g>
      <g stroke="${STROKE}" stroke-width="${SW2}" stroke-linecap="round" fill="none" opacity="0.6">
        <path d="M80,140 q20,-6 40,0"/>
        <path d="M660,160 q20,-6 40,0"/>
        <path d="M700,200 q14,-4 28,0"/>
      </g>
    </svg>`,

  selfEmployed: `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A quiet desk with a lamp and papers">
      <g ${common}>
        <path d="M60,500 h680"/>
        <path d="M140,420 h520"/>
        <path d="M150,420 v-12 h500 v12"/>
        <path d="M170,420 v80 M630,420 v80"/>
        <path d="M170,500 q-14,4 -22,8 M630,500 q14,4 22,8"/>
        <path d="M450,420 v-10 h180 v10"/>
        <path d="M520,414 h12"/>
        <g transform="translate(220,280)">
          <path d="M0,130 q0,-30 0,-60 q0,-30 30,-50 q24,-16 50,-30"/>
          <path d="M70,-20 q14,-4 26,8 q12,12 6,24 q-6,12 -22,12 q-18,0 -22,-14 q-2,-12 12,-30z"/>
          <path d="M-14,140 h28"/>
          <path d="M-26,140 q-6,4 -8,10 h44 q-2,-6 -8,-10"/>
        </g>
        <g transform="translate(420,360)">
          <rect x="0" y="0" width="120" height="60" rx="2"/>
          <path d="M-6,8 h120 M-12,16 h120"/>
          <path d="M16,18 h80 M16,28 h70 M16,38 h60 M16,48 h40"/>
        </g>
        <g transform="translate(330,388)">
          <path d="M0,0 h36 v22 q0,10 -12,12 h-12 q-12,-2 -12,-12 z"/>
          <path d="M36,4 q12,2 12,12 q0,10 -12,12"/>
          <path d="M8,-12 q2,-8 -2,-14 M18,-12 q2,-8 -2,-14 M28,-12 q2,-8 -2,-14"/>
        </g>
        <g transform="translate(360,420)">
          <path d="M-40,0 v90 q0,8 8,8 h64 q8,0 8,-8 v-90"/>
          <path d="M-40,80 h80"/>
        </g>
        <g stroke-width="${SW2}" opacity="0.7">
          <path d="M120,80 v200 M180,80 v200"/>
          <path d="M120,180 h60"/>
        </g>
      </g>
    </svg>`,

  landlords: `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A row of refined British townhouses">
      <g ${common}>
        <path d="M40,520 h720"/>
        <path d="M40,540 h720" stroke-width="${SW2}" opacity="0.6"/>
        <g transform="translate(90,200)">
          <path d="M0,320 v-260 h180 v260"/>
          <path d="M-10,60 h200"/>
          <path d="M-20,50 l100,-44 l120,44"/>
          <path d="M120,4 v-30 h22 v22"/>
          <rect x="30" y="100" width="40" height="56" rx="1"/>
          <path d="M50,100 v56 M30,128 h40"/>
          <rect x="110" y="100" width="40" height="56" rx="1"/>
          <path d="M130,100 v56 M110,128 h40"/>
          <rect x="30" y="190" width="40" height="56" rx="1"/>
          <path d="M50,190 v56 M30,218 h40"/>
          <rect x="110" y="190" width="40" height="56" rx="1"/>
          <path d="M130,190 v56 M110,218 h40"/>
          <path d="M70,320 v-60 q0,-10 12,-10 h16 q12,0 12,10 v60"/>
          <circle cx="100" cy="290" r="2"/>
          <path d="M60,320 h60 M50,330 h80"/>
        </g>
        <g transform="translate(290,160)">
          <path d="M0,360 v-300 h190 v300"/>
          <path d="M-10,60 h210"/>
          <path d="M-20,50 l105,-46 l125,46"/>
          <path d="M126,4 v-32 h22 v24"/>
          <rect x="32" y="100" width="44" height="58" rx="1"/>
          <path d="M54,100 v58 M32,129 h44"/>
          <rect x="116" y="100" width="44" height="58" rx="1"/>
          <path d="M138,100 v58 M116,129 h44"/>
          <rect x="32" y="180" width="44" height="58" rx="1"/>
          <path d="M54,180 v58 M32,209 h44"/>
          <rect x="116" y="180" width="44" height="58" rx="1"/>
          <path d="M138,180 v58 M116,209 h44"/>
          <rect x="32" y="260" width="44" height="58" rx="1"/>
          <path d="M54,260 v58 M32,289 h44"/>
          <rect x="116" y="260" width="44" height="58" rx="1"/>
          <path d="M138,260 v58 M116,289 h44"/>
          <path d="M76,360 v-66 q0,-10 12,-10 h16 q12,0 12,10 v66"/>
          <path d="M88,300 h24"/>
          <circle cx="105" cy="324" r="2"/>
          <path d="M64,360 h64 M52,372 h88"/>
        </g>
        <g transform="translate(500,210)">
          <path d="M0,310 v-250 h180 v250"/>
          <path d="M-10,60 h200"/>
          <path d="M-20,50 l100,-42 l120,42"/>
          <path d="M120,8 v-28 h22 v22"/>
          <rect x="30" y="100" width="40" height="56" rx="1"/>
          <path d="M50,100 v56 M30,128 h40"/>
          <rect x="110" y="100" width="40" height="56" rx="1"/>
          <path d="M130,100 v56 M110,128 h40"/>
          <rect x="30" y="190" width="40" height="56" rx="1"/>
          <path d="M50,190 v56 M30,218 h40"/>
          <rect x="110" y="190" width="40" height="56" rx="1"/>
          <path d="M130,190 v56 M110,218 h40"/>
          <path d="M70,310 v-58 q0,-10 12,-10 h16 q12,0 12,10 v58"/>
          <circle cx="100" cy="280" r="2"/>
          <path d="M60,310 h60 M50,320 h80"/>
        </g>
        <g stroke-width="${SW2}" opacity="0.6">
          <path d="M80,80 q14,-14 30,-6 q10,-12 24,-4 q16,-2 14,12 q-2,8 -16,6 h-42 q-12,2 -10,-8z"/>
          <path d="M620,60 q14,-14 30,-6 q10,-12 24,-4 q16,-2 14,12 q-2,8 -16,6 h-42 q-12,2 -10,-8z"/>
        </g>
      </g>
    </svg>`,

  inheritance: `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A library with books, a framed picture and a small plant">
      <g ${common}>
        <path d="M60,520 h680"/>
        <g transform="translate(110,90)">
          <rect x="0" y="0" width="320" height="400" rx="2"/>
          <path d="M0,100 h320 M0,200 h320 M0,300 h320"/>
          <g>
            <path d="M14,100 v-60 h16 v60 M30,100 v-72 h18 v72 M48,100 v-50 h20 v50 M68,100 v-66 h14 v66"/>
            <path d="M100,100 v-58 h60 v58"/>
            <path d="M170,100 v-70 h16 v70 M186,100 v-58 h22 v58 M208,100 v-66 h14 v66 M222,100 v-72 h18 v72"/>
            <path d="M254,100 v-54 q0,-8 8,-8 h32 q8,0 8,8 v54"/>
          </g>
          <g>
            <path d="M14,200 v-60 h18 v60 M32,200 v-70 h14 v70 M46,200 v-56 h22 v56 M68,200 v-66 h16 v66"/>
            <path d="M100,200 v-50 h22 v50 M122,200 v-66 h14 v66 M136,200 v-58 h22 v58"/>
            <path d="M180,200 v-12 h60 v12 M180,188 v-10 h60 v10 M180,178 v-12 h60 v12"/>
            <path d="M260,200 v-66 h14 v66 M274,200 v-54 h18 v54 M292,200 v-72 h12 v72"/>
          </g>
          <g>
            <path d="M14,300 v-66 h16 v66 M30,300 v-50 h22 v50 M52,300 v-72 h14 v72 M66,300 v-58 h20 v58"/>
            <path d="M120,300 v-30 h40 v30 z"/>
            <path d="M124,270 q4,-30 16,-44 q4,-6 14,-2 q6,2 6,12 q0,16 -10,30"/>
            <path d="M140,260 q-2,-18 -10,-26"/>
            <path d="M150,256 q4,-14 14,-18"/>
            <path d="M218,300 v-66 h14 v66 M232,300 v-50 h22 v50 M254,300 v-72 h14 v72 M268,300 v-58 h20 v58"/>
          </g>
          <g>
            <path d="M14,400 v-66 h16 v66 M30,400 v-72 h14 v72 M44,400 v-54 h22 v54 M66,400 v-66 h16 v66"/>
            <path d="M100,400 v-58 h22 v58 M122,400 v-72 h14 v72"/>
            <path d="M150,400 v-12 h70 v12 M150,388 v-10 h70 v10"/>
            <path d="M240,400 v-66 h16 v66 M256,400 v-54 h22 v54 M278,400 v-72 h14 v72 M292,400 v-58 h12 v58"/>
          </g>
          <path d="M0,400 v20 h320 v-20"/>
        </g>
        <g transform="translate(500,140)">
          <rect x="0" y="0" width="180" height="140" rx="2"/>
          <path d="M14,14 h152 v112 h-152 z"/>
          <path d="M20,100 l40,-30 l30,20 l30,-26 l36,30"/>
          <circle cx="140" cy="40" r="10"/>
        </g>
        <g transform="translate(500,330)">
          <path d="M0,150 h200 M20,150 v60 M180,150 v60"/>
          <path d="M0,150 v-12 h200 v12"/>
          <rect x="20" y="118" width="60" height="20" rx="1"/>
          <path d="M30,128 h40 M30,134 h30"/>
          <path d="M120,138 v-30 q0,-6 6,-6 h6 q6,0 6,6 v30"/>
          <path d="M126,108 v-12"/>
          <path d="M160,138 v-26 q0,-8 8,-8 h12 q8,0 8,8 v26"/>
          <path d="M170,104 q-2,-30 8,-46"/>
          <path d="M180,86 q10,-6 16,-2"/>
        </g>
      </g>
    </svg>`,

  advisory: `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An abstract architectural composition of arches and light">
      <g ${common}>
        <path d="M60,500 h680"/>
        <g transform="translate(140,140)">
          <path d="M0,360 v-220 q0,-140 130,-140 q130,0 130,140 v220"/>
          <path d="M40,360 v-180 q0,-100 90,-100 q90,0 90,100 v180"/>
          <path d="M80,360 v-140 q0,-60 50,-60 q50,0 50,60 v140"/>
        </g>
        <g transform="translate(540,180)">
          <path d="M0,320 v-300 M40,320 v-300"/>
          <path d="M-6,20 h52 M-6,12 h52"/>
          <path d="M-10,-2 h60 M-10,-10 h60"/>
          <path d="M0,-10 q4,-14 20,-14 q16,0 20,14"/>
          <g stroke-width="${SW2}" opacity="0.6">
            <path d="M8,40 v260 M16,40 v260 M24,40 v260 M32,40 v260"/>
          </g>
        </g>
        <g stroke-width="${SW2}" opacity="0.7">
          <path d="M80,80 l300,300"/>
          <path d="M120,80 l300,300"/>
          <path d="M160,80 l300,300"/>
        </g>
        <g stroke-width="${SW2}" opacity="0.55">
          <path d="M120,520 l-40,40"/>
          <path d="M260,520 l-40,40"/>
          <path d="M400,520 l-40,40"/>
          <path d="M540,520 l-40,40"/>
          <path d="M680,520 l-40,40"/>
        </g>
      </g>
    </svg>`,
};
