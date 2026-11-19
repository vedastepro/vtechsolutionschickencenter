// Hand-drawn style SVG illustrations used as default product art.
const S = `stroke="#2b211b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

export const art = {
  chicks: `<svg viewBox="0 0 220 180" aria-hidden="true">
    <ellipse cx="110" cy="168" rx="90" ry="8" fill="#2b211b" opacity=".12"/>
    <g><ellipse cx="80" cy="118" rx="46" ry="42" fill="#f7cf55" ${S}/><circle cx="84" cy="70" r="30" fill="#f7cf55" ${S}/>
    <circle cx="94" cy="64" r="4" fill="#2b211b"/><path d="M110 72l16 4-16 6z" fill="#e07b2b" ${S}/>
    <path d="M48 112c10 10 26 12 38 4" fill="none" ${S}/><path d="M70 158v10M90 158v10" ${S}/><path d="M78 42c2-8 10-10 12-4" fill="none" ${S}/></g>
    <g><ellipse cx="160" cy="132" rx="32" ry="30" fill="#fbe08a" ${S}/><circle cx="168" cy="98" r="22" fill="#fbe08a" ${S}/>
    <circle cx="175" cy="94" r="3.2" fill="#2b211b"/><path d="M188 99l12 3-12 5z" fill="#e07b2b" ${S}/><path d="M150 160v8M166 160v8" ${S}/></g>
  </svg>`,
  eggs: `<svg viewBox="0 0 220 180" aria-hidden="true">
    <ellipse cx="110" cy="168" rx="92" ry="8" fill="#2b211b" opacity=".12"/>
    <path d="M18 132h184l-12 30H30z" fill="#c9a878" ${S}/><path d="M40 132c6-10 18-10 24 0M86 132c6-10 18-10 24 0M132 132c6-10 18-10 24 0" fill="none" ${S}/>
    <ellipse cx="52" cy="104" rx="24" ry="31" fill="#e8c49a" ${S}/><ellipse cx="98" cy="96" rx="25" ry="33" fill="#f4e6cf" ${S}/>
    <ellipse cx="146" cy="104" rx="24" ry="31" fill="#d9a877" ${S}/><ellipse cx="184" cy="110" rx="18" ry="24" fill="#f0d7b4" ${S}/>
    <path d="M88 80c4-6 10-8 14-6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
  </svg>`,
  mature: `<svg viewBox="0 0 220 190" aria-hidden="true">
    <ellipse cx="110" cy="178" rx="80" ry="8" fill="#2b211b" opacity=".12"/>
    <path d="M60 110c0-36 30-58 62-54 22 3 34 20 34 20l30-30c4 30-2 58-22 76-20 18-60 24-82 10-16-8-22-14-22-22z" fill="#b5532c" ${S}/>
    <path d="M150 70c-4-30 6-48 18-50 4 10 6 18 0 26 10-4 16 0 18 6-6 4-12 6-20 4" fill="#9c3b1c" ${S}/>
    <circle cx="64" cy="80" r="24" fill="#c86a3c" ${S}/><path d="M50 58c0-12 8-16 12-10 2-8 10-8 12 0 4-4 10 0 8 8" fill="#d63a2a" ${S}/>
    <circle cx="58" cy="78" r="3.5" fill="#2b211b"/><path d="M42 84l-14 4 14 6z" fill="#e8a531" ${S}/><path d="M50 98c0 10 8 12 10 4" fill="#d63a2a" ${S}/>
    <path d="M96 120c14 10 34 10 48 0" fill="none" ${S}/><path d="M98 158v20h-8M124 158v20h8" fill="none" ${S}/>
  </svg>`,
  feeds: `<svg viewBox="0 0 220 190" aria-hidden="true">
    <ellipse cx="110" cy="178" rx="78" ry="8" fill="#2b211b" opacity=".12"/>
    <path d="M58 40h104l10 130H48z" fill="#e9dcbc" ${S}/><path d="M58 40c10-14 94-14 104 0" fill="#d9c49a" ${S}/>
    <path d="M70 30l8 10M100 26v14M130 28l-6 12M150 32l-6 8" ${S}/>
    <rect x="70" y="82" width="80" height="54" rx="8" fill="#6f7d52" ${S}/>
    <text x="110" y="106" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="16" fill="#f5ecd9">FEED</text>
    <text x="110" y="126" text-anchor="middle" font-family="monospace" font-size="12" fill="#f5ecd9">50 KG</text>
    <g fill="#e8a531" ${S}><circle cx="178" cy="164" r="5"/><circle cx="190" cy="170" r="4"/><circle cx="168" cy="172" r="4"/></g>
  </svg>`,
  basket: `<svg viewBox="0 0 200 160" aria-hidden="true">
    <ellipse cx="100" cy="150" rx="78" ry="7" fill="#2b211b" opacity=".12"/>
    <path d="M40 70c0-40 120-40 120 0" fill="none" ${S} stroke-width="5"/>
    <path d="M24 70h152l-16 70H40z" fill="#c9a878" ${S}/><path d="M40 92h120M46 116h108" ${S}/>
    <ellipse cx="80" cy="62" rx="12" ry="16" fill="#f4e6cf" ${S}/>
  </svg>`,
};

export type Category = "chicks" | "eggs" | "mature" | "feeds";
export const categoryInfo: Record<Category, { label: string; blurb: string }> = {
  chicks: { label: "Young chicks", blurb: "Vaccinated day-old broilers, layers and brooded kienyeji chicks." },
  eggs: { label: "Eggs", blurb: "Table eggs collected each morning, plus fertile hatching eggs." },
  mature: { label: "Mature chickens", blurb: "Market-weight broilers, point-of-lay hens and dressed birds." },
  feeds: { label: "Chicken feeds", blurb: "Starter, finisher and layers feed in 50 kg bags." },
};
