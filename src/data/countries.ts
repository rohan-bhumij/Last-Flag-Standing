export type FlagPatternType =
  | 'h3' // 3 horizontal bands
  | 'v3' // 3 vertical bands
  | 'h2' // 2 horizontal bands
  | 'v2' // 2 vertical bands
  | 'nordic' // Nordic cross
  | 'center_cross' // Centered cross (England/Switzerland/Georgia)
  | 'saltire' // Diagonal cross (Jamaica/Scotland)
  | 'circle' // Center disc (Japan, Bangladesh, Brazil, South Korea, Palau)
  | 'usa' // Stripes + canton
  | 'uk' // Union Jack
  | 'greece' // Stripes + cross canton
  | 'costa_rica' // 5 horizontal bands (blue-white-red-white-blue)
  | 'thailand' // 5 horizontal bands (red-white-blue-white-red)
  | 'cuba_pr' // Stripes + left triangle with star
  | 'philippines' // 2 horizontal bands + white left triangle + sun
  | 'czech' // 2 horizontal bands + blue left triangle
  | 'south_africa' // Y-pall vibrant flag
  | 'tanzania' // Diagonal band with yellow fimbriation
  | 'trinidad' // Diagonal band with white fimbriation
  | 'crescent_star' // Solid/bands with crescent & star (Turkey, Pakistan, Tunisia, Algeria, Malaysia, Singapore, Uzbekistan, Azerbaijan, Mauritania)
  | 'india' //Tricolor + navy chakra wheel
  | 'argentina' // Tricolor + Sun of May
  | 'canada' // Red-white-red + center maple emblem
  | 'saudi' // Green + white sword & script band
  | 'kenya' // Black-red-green with white fimbriation & shield
  | 'nepal' // Crimson double pennon with sun/moon on deep blue arena badge
  | 'israel' // White with blue stripes & hexagram
  | 'kazakhstan' // Sky blue with gold sun & steppe eagle
  | 'uruguay'; // White/blue stripes with gold sun in canton

export interface CountrySpec {
  id: number;
  code: string; // ISO 3166-1 alpha-2
  abbr: string; // 3-letter broadcast code
  name: string;
  region: 'Americas' | 'Europe' | 'Asia' | 'Africa' | 'Oceania';
  pattern: FlagPatternType;
  colors: string[]; // Primary palette used to draw the authentic flag
  emblemColor?: string;
  emblemType?: 'star' | 'sun' | 'crescent' | 'chakra' | 'diamond' | 'maple' | 'shield' | 'eagle' | 'coat' | 'cross' | 'taeguk';
}

export const COUNTRIES_64: CountrySpec[] = [
  { id: 1, code: 'CR', abbr: 'CRC', name: 'Costa Rica', region: 'Americas', pattern: 'costa_rica', colors: ['#002B7F', '#FFFFFF', '#CE1126'] },
  { id: 2, code: 'IN', abbr: 'IND', name: 'India', region: 'Asia', pattern: 'india', colors: ['#FF9933', '#FFFFFF', '#138808'], emblemColor: '#000080', emblemType: 'chakra' },
  { id: 3, code: 'PH', abbr: 'PHI', name: 'Philippines', region: 'Asia', pattern: 'philippines', colors: ['#0038A8', '#CE1126', '#FFFFFF'], emblemColor: '#FCD116', emblemType: 'sun' },
  { id: 4, code: 'US', abbr: 'USA', name: 'United States', region: 'Americas', pattern: 'usa', colors: ['#B22234', '#FFFFFF', '#3C3B6E'], emblemColor: '#FFFFFF', emblemType: 'star' },
  { id: 5, code: 'BR', abbr: 'BRA', name: 'Brazil', region: 'Americas', pattern: 'circle', colors: ['#009739', '#FEDD00', '#012169'], emblemColor: '#FFFFFF', emblemType: 'diamond' },
  { id: 6, code: 'AR', abbr: 'ARG', name: 'Argentina', region: 'Americas', pattern: 'argentina', colors: ['#74ACDF', '#FFFFFF', '#74ACDF'], emblemColor: '#F6B40E', emblemType: 'sun' },
  { id: 7, code: 'GB', abbr: 'GBR', name: 'United Kingdom', region: 'Europe', pattern: 'uk', colors: ['#012169', '#FFFFFF', '#C8102E'] },
  { id: 8, code: 'JP', abbr: 'JPN', name: 'Japan', region: 'Asia', pattern: 'circle', colors: ['#FFFFFF', '#BC002D'] },
  { id: 9, code: 'DE', abbr: 'GER', name: 'Germany', region: 'Europe', pattern: 'h3', colors: ['#111111', '#DD0000', '#FFCE00'] },
  { id: 10, code: 'FR', abbr: 'FRA', name: 'France', region: 'Europe', pattern: 'v3', colors: ['#002395', '#FFFFFF', '#ED2939'] },
  { id: 11, code: 'IT', abbr: 'ITA', name: 'Italy', region: 'Europe', pattern: 'v3', colors: ['#009246', '#FFFFFF', '#CE2B37'] },
  { id: 12, code: 'CA', abbr: 'CAN', name: 'Canada', region: 'Americas', pattern: 'canada', colors: ['#FF0000', '#FFFFFF', '#FF0000'], emblemColor: '#FF0000', emblemType: 'maple' },
  { id: 13, code: 'AU', abbr: 'AUS', name: 'Australia', region: 'Oceania', pattern: 'uk', colors: ['#00008B', '#FFFFFF', '#FF0000'], emblemColor: '#FFFFFF', emblemType: 'star' },
  { id: 14, code: 'KR', abbr: 'KOR', name: 'South Korea', region: 'Asia', pattern: 'circle', colors: ['#FFFFFF', '#CD2E3A', '#0047A0'], emblemColor: '#111111', emblemType: 'taeguk' },
  { id: 15, code: 'MX', abbr: 'MEX', name: 'Mexico', region: 'Americas', pattern: 'v3', colors: ['#006847', '#FFFFFF', '#CE1126'], emblemColor: '#8B5A2B', emblemType: 'coat' },
  { id: 16, code: 'ES', abbr: 'ESP', name: 'Spain', region: 'Europe', pattern: 'h3', colors: ['#AA151B', '#F1BF00', '#AA151B'], emblemColor: '#AA151B', emblemType: 'coat' },
  { id: 17, code: 'NG', abbr: 'NGA', name: 'Nigeria', region: 'Africa', pattern: 'v3', colors: ['#008751', '#FFFFFF', '#008751'] },
  { id: 18, code: 'ZA', abbr: 'RSA', name: 'South Africa', region: 'Africa', pattern: 'south_africa', colors: ['#E03C31', '#001489', '#007749', '#FFB81C', '#FFFFFF', '#111111'] },
  { id: 19, code: 'EG', abbr: 'EGY', name: 'Egypt', region: 'Africa', pattern: 'h3', colors: ['#CE1126', '#FFFFFF', '#111111'], emblemColor: '#C09300', emblemType: 'eagle' },
  { id: 20, code: 'KE', abbr: 'KEN', name: 'Kenya', region: 'Africa', pattern: 'kenya', colors: ['#111111', '#BB0000', '#006600', '#FFFFFF'], emblemColor: '#BB0000', emblemType: 'shield' },
  { id: 21, code: 'SA', abbr: 'KSA', name: 'Saudi Arabia', region: 'Asia', pattern: 'saudi', colors: ['#006C35', '#FFFFFF'] },
  { id: 22, code: 'TR', abbr: 'TUR', name: 'Turkey', region: 'Europe', pattern: 'crescent_star', colors: ['#E30A17', '#FFFFFF'] },
  { id: 23, code: 'ID', abbr: 'IDN', name: 'Indonesia', region: 'Asia', pattern: 'h2', colors: ['#FF0000', '#FFFFFF'] },
  { id: 24, code: 'PK', abbr: 'PAK', name: 'Pakistan', region: 'Asia', pattern: 'crescent_star', colors: ['#01411C', '#FFFFFF'] },
  { id: 25, code: 'BD', abbr: 'BAN', name: 'Bangladesh', region: 'Asia', pattern: 'circle', colors: ['#006A4E', '#F42A41'] },
  { id: 26, code: 'VN', abbr: 'VIE', name: 'Vietnam', region: 'Asia', pattern: 'circle', colors: ['#DA251D', '#FFFF00'], emblemColor: '#FFFF00', emblemType: 'star' },
  { id: 27, code: 'TH', abbr: 'THA', name: 'Thailand', region: 'Asia', pattern: 'thailand', colors: ['#A51931', '#F4F5F8', '#2D2A4A'] },
  { id: 28, code: 'MY', abbr: 'MAS', name: 'Malaysia', region: 'Asia', pattern: 'usa', colors: ['#CC0001', '#FFFFFF', '#010066'], emblemColor: '#FFCC00', emblemType: 'crescent' },
  { id: 29, code: 'SG', abbr: 'SGP', name: 'Singapore', region: 'Asia', pattern: 'h2', colors: ['#EF3340', '#FFFFFF'], emblemColor: '#FFFFFF', emblemType: 'crescent' },
  { id: 30, code: 'CO', abbr: 'COL', name: 'Colombia', region: 'Americas', pattern: 'h3', colors: ['#FCD116', '#003893', '#CE1126'] },
  { id: 31, code: 'CL', abbr: 'CHI', name: 'Chile', region: 'Americas', pattern: 'h2', colors: ['#FFFFFF', '#D52B1E', '#0039A6'], emblemColor: '#FFFFFF', emblemType: 'star' },
  { id: 32, code: 'PE', abbr: 'PER', name: 'Peru', region: 'Americas', pattern: 'v3', colors: ['#D91023', '#FFFFFF', '#D91023'], emblemColor: '#D91023', emblemType: 'coat' },
  { id: 33, code: 'VE', abbr: 'VEN', name: 'Venezuela', region: 'Americas', pattern: 'h3', colors: ['#FCE300', '#00247D', '#CF142B'], emblemColor: '#FFFFFF', emblemType: 'star' },
  { id: 34, code: 'UA', abbr: 'UKR', name: 'Ukraine', region: 'Europe', pattern: 'h2', colors: ['#0057B7', '#FFD700'] },
  { id: 35, code: 'PL', abbr: 'POL', name: 'Poland', region: 'Europe', pattern: 'h2', colors: ['#FFFFFF', '#DC143C'] },
  { id: 36, code: 'SE', abbr: 'SWE', name: 'Sweden', region: 'Europe', pattern: 'nordic', colors: ['#006AA7', '#FECC02'] },
  { id: 37, code: 'NO', abbr: 'NOR', name: 'Norway', region: 'Europe', pattern: 'nordic', colors: ['#BA0C2F', '#00205B', '#FFFFFF'] },
  { id: 38, code: 'FI', abbr: 'FIN', name: 'Finland', region: 'Europe', pattern: 'nordic', colors: ['#FFFFFF', '#003580'] },
  { id: 39, code: 'DK', abbr: 'DEN', name: 'Denmark', region: 'Europe', pattern: 'nordic', colors: ['#C8102E', '#FFFFFF'] },
  { id: 40, code: 'NL', abbr: 'NED', name: 'Netherlands', region: 'Europe', pattern: 'h3', colors: ['#AE1C28', '#FFFFFF', '#21468B'] },
  { id: 41, code: 'BE', abbr: 'BEL', name: 'Belgium', region: 'Europe', pattern: 'v3', colors: ['#111111', '#FDDA24', '#EF3340'] },
  { id: 42, code: 'CH', abbr: 'SUI', name: 'Switzerland', region: 'Europe', pattern: 'center_cross', colors: ['#FF0000', '#FFFFFF'] },
  { id: 43, code: 'AT', abbr: 'AUT', name: 'Austria', region: 'Europe', pattern: 'h3', colors: ['#ED2939', '#FFFFFF', '#ED2939'] },
  { id: 44, code: 'PT', abbr: 'POR', name: 'Portugal', region: 'Europe', pattern: 'v2', colors: ['#006600', '#FF0000'], emblemColor: '#FFCC00', emblemType: 'coat' },
  { id: 45, code: 'GR', abbr: 'GRE', name: 'Greece', region: 'Europe', pattern: 'greece', colors: ['#0D5EAF', '#FFFFFF'] },
  { id: 46, code: 'CZ', abbr: 'CZE', name: 'Czechia', region: 'Europe', pattern: 'czech', colors: ['#FFFFFF', '#D7141A', '#11457E'] },
  { id: 47, code: 'HU', abbr: 'HUN', name: 'Hungary', region: 'Europe', pattern: 'h3', colors: ['#CE2939', '#FFFFFF', '#477050'] },
  { id: 48, code: 'RO', abbr: 'ROU', name: 'Romania', region: 'Europe', pattern: 'v3', colors: ['#002B7F', '#FCD116', '#CE1126'] },
  { id: 49, code: 'IE', abbr: 'IRL', name: 'Ireland', region: 'Europe', pattern: 'v3', colors: ['#169B62', '#FFFFFF', '#FF883E'] },
  { id: 50, code: 'NZ', abbr: 'NZL', name: 'New Zealand', region: 'Oceania', pattern: 'uk', colors: ['#00247D', '#CC142B', '#FFFFFF'], emblemColor: '#CC142B', emblemType: 'star' },
  { id: 51, code: 'JM', abbr: 'JAM', name: 'Jamaica', region: 'Americas', pattern: 'saltire', colors: ['#009B3A', '#111111', '#FED100'] },
  { id: 52, code: 'CU', abbr: 'CUB', name: 'Cuba', region: 'Americas', pattern: 'cuba_pr', colors: ['#002A8F', '#FFFFFF', '#CF142B'], emblemColor: '#FFFFFF', emblemType: 'star' },
  { id: 53, code: 'PA', abbr: 'PAN', name: 'Panama', region: 'Americas', pattern: 'h2', colors: ['#FFFFFF', '#DA121A', '#072357'], emblemColor: '#072357', emblemType: 'star' },
  { id: 54, code: 'UY', abbr: 'URU', name: 'Uruguay', region: 'Americas', pattern: 'uruguay', colors: ['#FFFFFF', '#0038A8'], emblemColor: '#FCD116', emblemType: 'sun' },
  { id: 55, code: 'MA', abbr: 'MAR', name: 'Morocco', region: 'Africa', pattern: 'circle', colors: ['#C1272D', '#006233'], emblemColor: '#006233', emblemType: 'star' },
  { id: 56, code: 'GH', abbr: 'GHA', name: 'Ghana', region: 'Africa', pattern: 'h3', colors: ['#CE1126', '#FCD116', '#006B3F'], emblemColor: '#111111', emblemType: 'star' },
  { id: 57, code: 'TZ', abbr: 'TAN', name: 'Tanzania', region: 'Africa', pattern: 'tanzania', colors: ['#1EB53A', '#00A3DD', '#111111', '#FCD116'] },
  { id: 58, code: 'ET', abbr: 'ETH', name: 'Ethiopia', region: 'Africa', pattern: 'h3', colors: ['#078930', '#FCDD09', '#DA121A'], emblemColor: '#0F47AF', emblemType: 'star' },
  { id: 59, code: 'DZ', abbr: 'ALG', name: 'Algeria', region: 'Africa', pattern: 'v2', colors: ['#006233', '#FFFFFF'], emblemColor: '#D21034', emblemType: 'crescent' },
  { id: 60, code: 'KZ', abbr: 'KAZ', name: 'Kazakhstan', region: 'Asia', pattern: 'kazakhstan', colors: ['#00AFCA', '#FEC50C'] },
  { id: 61, code: 'UZ', abbr: 'UZB', name: 'Uzbekistan', region: 'Asia', pattern: 'h3', colors: ['#0099B5', '#FFFFFF', '#1EB53A'], emblemColor: '#CE1126', emblemType: 'crescent' },
  { id: 62, code: 'AZ', abbr: 'AZE', name: 'Azerbaijan', region: 'Europe', pattern: 'h3', colors: ['#00B5E2', '#EF3340', '#509E2F'], emblemColor: '#FFFFFF', emblemType: 'crescent' },
  { id: 63, code: 'GE', abbr: 'GEO', name: 'Georgia', region: 'Europe', pattern: 'center_cross', colors: ['#FFFFFF', '#FF0000'], emblemColor: '#FF0000', emblemType: 'cross' },
  { id: 64, code: 'NP', abbr: 'NEP', name: 'Nepal', region: 'Asia', pattern: 'nepal', colors: ['#0B1536', '#DC143C', '#003893', '#FFFFFF'] },
];

export interface ManifestValidationResult {
  valid: boolean;
  totalCount: number;
  missingFlags: string[];
  duplicateCodes: string[];
}

export function validateCountryManifest(roster: CountrySpec[] = COUNTRIES_64): ManifestValidationResult {
  const seenCodes = new Set<string>();
  const seenAbbrs = new Set<string>();
  const duplicateCodes: string[] = [];
  const missingFlags: string[] = [];

  for (const country of roster) {
    if (seenCodes.has(country.code)) {
      duplicateCodes.push(country.code);
    }
    seenCodes.add(country.code);
    if (seenAbbrs.has(country.abbr)) {
      duplicateCodes.push(country.abbr);
    }
    seenAbbrs.add(country.abbr);

    if (!country.colors || country.colors.length < 2 || !country.pattern || !country.name) {
      missingFlags.push(country.code || String(country.id));
    }
  }

  return {
    valid: roster.length === 64 && duplicateCodes.length === 0 && missingFlags.length === 0,
    totalCount: roster.length,
    missingFlags,
    duplicateCodes,
  };
}

function drawFivePointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  color: string,
  points = 5
) {
  const innerR = outerR * 0.42;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawCrescentAndStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fgColor: string,
  bgColor: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fgColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx + r * 0.3, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  drawFivePointStar(ctx, cx + r * 0.65, cy, r * 0.36, fgColor, 5);
  ctx.restore();
}

/**
 * Draws a crisp, authentic national flag inside a circular token at (cx, cy, radius).
 * Used both for pre-rendering high-DPI offscreen token sprites and for UI flag badges.
 */
export function drawCountryFlagOnContext(
  ctx: CanvasRenderingContext2D,
  country: CountrySpec,
  cx: number,
  cy: number,
  radius: number
) {
  const d = radius * 2;
  const x0 = cx - radius;
  const y0 = cy - radius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const c = country.colors;

  switch (country.pattern) {
    case 'h2': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, radius);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, cy, d, radius);
      if (country.code === 'CL') {
        ctx.fillStyle = c[2];
        ctx.fillRect(x0, y0, radius * 0.95, radius);
        drawFivePointStar(ctx, x0 + radius * 0.52, y0 + radius * 0.56, radius * 0.24, '#FFFFFF');
      } else if (country.code === 'SG') {
        drawCrescentAndStar(ctx, x0 + radius * 0.6, y0 + radius * 0.55, radius * 0.24, '#FFFFFF', c[0]);
      } else if (country.code === 'PA') {
        // 4 quadrants
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x0, y0, radius, radius);
        ctx.fillRect(cx, cy, radius, radius);
        ctx.fillStyle = '#DA121A';
        ctx.fillRect(cx, y0, radius, radius);
        ctx.fillStyle = '#072357';
        ctx.fillRect(x0, cy, radius, radius);
        drawFivePointStar(ctx, x0 + radius * 0.55, y0 + radius * 0.55, radius * 0.22, '#072357');
        drawFivePointStar(ctx, cx + radius * 0.45, cy + radius * 0.45, radius * 0.22, '#DA121A');
      }
      break;
    }

    case 'v2': {
      const split = country.code === 'PT' ? d * 0.42 : radius;
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, split, d);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0 + split, y0, d - split, d);
      if (country.code === 'PT') {
        ctx.beginPath();
        ctx.arc(x0 + split, cy, radius * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#FFCC00';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x0 + split, cy, radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      } else if (country.code === 'DZ') {
        // Algeria crescent & star in center
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#D21034';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + radius * 0.12, cy, radius * 0.33, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, radius, d);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(cx + radius * 0.12, cy, radius * 0.33, 0, Math.PI * 2);
        ctx.fillStyle = '#006233';
        ctx.fill();
        ctx.restore();
        drawFivePointStar(ctx, cx + radius * 0.18, cy, radius * 0.18, '#D21034');
      }
      break;
    }

    case 'h3': {
      const isCol = country.code === 'CO';
      const isEsp = country.code === 'ES';
      const h1 = isCol ? d * 0.48 : isEsp ? d * 0.27 : d / 3;
      const h2 = isCol ? d * 0.26 : isEsp ? d * 0.46 : d / 3;
      const h3 = d - h1 - h2;

      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, h1);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, y0 + h1, d, h2);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0 + h1 + h2, d, h3);

      if (country.code === 'UZ') {
        ctx.fillStyle = '#CE1126';
        ctx.fillRect(x0, y0 + h1 - 1.5, d, 3);
        ctx.fillRect(x0, y0 + h1 + h2 - 1.5, d, 3);
      } else if (country.code === 'GH') {
        drawFivePointStar(ctx, cx, cy, radius * 0.26, '#111111');
      } else if (country.code === 'ET') {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = '#0F47AF';
        ctx.fill();
        drawFivePointStar(ctx, cx, cy, radius * 0.26, '#FCDD09');
      } else if (country.code === 'AZ') {
        drawCrescentAndStar(ctx, cx, cy, radius * 0.22, '#FFFFFF', c[1]);
      } else if (country.code === 'VE') {
        for (let i = -2; i <= 2; i++) {
          const ang = (i * 0.35) - Math.PI / 2;
          drawFivePointStar(
            ctx,
            cx + Math.cos(ang) * radius * 0.32,
            cy + radius * 0.15 + Math.sin(ang) * radius * 0.25,
            radius * 0.08,
            '#FFFFFF'
          );
        }
      } else if (country.code === 'EG' || country.code === 'ES') {
        ctx.beginPath();
        ctx.arc(cx - (isEsp ? radius * 0.22 : 0), cy, radius * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = country.emblemColor || '#C09300';
        ctx.fill();
      }
      break;
    }

    case 'v3': {
      const w = d / 3;
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, w, d);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0 + w, y0, w, d);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0 + w * 2, y0, w, d);
      if (country.code === 'MX' || country.code === 'PE') {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = country.emblemColor || '#8B5A2B';
        ctx.fill();
      }
      break;
    }

    case 'india': {
      const h = d / 3;
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, h);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, y0 + h, d, h);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0 + h * 2, d, h);
      // Ashoka Chakra
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.24, 0, Math.PI * 2);
      ctx.strokeStyle = '#000080';
      ctx.lineWidth = Math.max(1.5, radius * 0.07);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#000080';
      ctx.fill();
      break;
    }

    case 'argentina': {
      const h = d / 3;
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, h);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, y0 + h, d, h);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0 + h * 2, d, h);
      drawFivePointStar(ctx, cx, cy, radius * 0.25, '#F6B40E', 12);
      break;
    }

    case 'canada': {
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(x0, y0, d * 0.27, d);
      ctx.fillRect(x0 + d * 0.73, y0, d * 0.27, d);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x0 + d * 0.27, y0, d * 0.46, d);
      drawFivePointStar(ctx, cx, cy, radius * 0.36, '#FF0000', 7);
      break;
    }

    case 'costa_rica': {
      // Blue, white, double-red, white, blue
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, y0 + d * 0.16, d, d * 0.68);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0 + d * 0.32, d, d * 0.36);
      break;
    }

    case 'thailand': {
      // Red, white, double-blue, white, red
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, y0 + d * 0.16, d, d * 0.68);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0 + d * 0.32, d, d * 0.36);
      break;
    }

    case 'nordic': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      const crossX = x0 + d * 0.38;
      if (c.length === 3) {
        // Norway outer white fimbriation
        ctx.fillStyle = c[2];
        ctx.fillRect(crossX - radius * 0.24, y0, radius * 0.48, d);
        ctx.fillRect(x0, cy - radius * 0.24, d, radius * 0.48);
      }
      ctx.fillStyle = c[1];
      ctx.fillRect(crossX - radius * 0.14, y0, radius * 0.28, d);
      ctx.fillRect(x0, cy - radius * 0.14, d, radius * 0.28);
      break;
    }

    case 'center_cross': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = c[1];
      if (country.code === 'CH') {
        ctx.fillRect(cx - radius * 0.18, cy - radius * 0.55, radius * 0.36, radius * 1.1);
        ctx.fillRect(cx - radius * 0.55, cy - radius * 0.18, radius * 1.1, radius * 0.36);
      } else {
        // Georgia 5-cross flag
        ctx.fillRect(cx - radius * 0.16, y0, radius * 0.32, d);
        ctx.fillRect(x0, cy - radius * 0.16, d, radius * 0.32);
        const offsets = [
          [-0.45, -0.45],
          [0.45, -0.45],
          [-0.45, 0.45],
          [0.45, 0.45],
        ];
        for (const [ox, oy] of offsets) {
          ctx.fillRect(cx + ox * radius - radius * 0.06, cy + oy * radius - radius * 0.16, radius * 0.12, radius * 0.32);
          ctx.fillRect(cx + ox * radius - radius * 0.16, cy + oy * radius - radius * 0.06, radius * 0.32, radius * 0.12);
        }
      }
      break;
    }

    case 'saltire': {
      // Jamaica: green top/bottom, black left/right, gold diagonal cross
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = c[1];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx, cy);
      ctx.lineTo(x0, y0 + d);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x0 + d, y0);
      ctx.lineTo(cx, cy);
      ctx.lineTo(x0 + d, y0 + d);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = c[2];
      ctx.lineWidth = radius * 0.28;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + d, y0 + d);
      ctx.moveTo(x0 + d, y0);
      ctx.lineTo(x0, y0 + d);
      ctx.stroke();
      break;
    }

    case 'circle': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      if (country.code === 'BR') {
        // Yellow diamond
        ctx.fillStyle = c[1];
        ctx.beginPath();
        ctx.moveTo(cx, y0 + radius * 0.28);
        ctx.lineTo(x0 + d - radius * 0.22, cy);
        ctx.lineTo(cx, y0 + d - radius * 0.28);
        ctx.lineTo(x0 + radius * 0.22, cy);
        ctx.closePath();
        ctx.fill();
        // Blue globe
        ctx.fillStyle = c[2];
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.38, 0, Math.PI * 2);
        ctx.fill();
        // White band
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1.5, radius * 0.08);
        ctx.beginPath();
        ctx.arc(cx - radius * 0.08, cy + radius * 0.3, radius * 0.42, -Math.PI * 0.75, -Math.PI * 0.15);
        ctx.stroke();
      } else if (country.code === 'KR') {
        // South Korea Taeguk + trigrams
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.44, Math.PI, 0);
        ctx.fillStyle = c[1];
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.44, 0, Math.PI);
        ctx.fillStyle = c[2];
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - radius * 0.22, cy, radius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = c[1];
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + radius * 0.22, cy, radius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = c[2];
        ctx.fill();
      } else if (country.code === 'VN') {
        drawFivePointStar(ctx, cx, cy, radius * 0.5, c[1]);
      } else if (country.code === 'MA') {
        ctx.strokeStyle = c[1];
        ctx.lineWidth = Math.max(1.5, radius * 0.1);
        drawFivePointStar(ctx, cx, cy, radius * 0.44, c[1]);
      } else {
        // Japan / Bangladesh
        ctx.beginPath();
        ctx.arc(cx - (country.code === 'BD' ? radius * 0.08 : 0), cy, radius * 0.48, 0, Math.PI * 2);
        ctx.fillStyle = c[1];
        ctx.fill();
      }
      break;
    }

    case 'usa': {
      const stripes = 9;
      const sh = d / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? c[0] : c[1];
        ctx.fillRect(x0, y0 + i * sh, d, sh + 0.5);
      }
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0, radius * 1.05, radius * 1.05);
      if (country.code === 'MY') {
        drawCrescentAndStar(ctx, x0 + radius * 0.52, y0 + radius * 0.55, radius * 0.26, '#FFCC00', c[2]);
      } else {
        // US stars grid
        ctx.fillStyle = '#FFFFFF';
        for (let r = 0; r < 3; r++) {
          for (let col = 0; col < 3; col++) {
            ctx.beginPath();
            ctx.arc(
              x0 + radius * (0.3 + col * 0.24),
              y0 + radius * (0.3 + r * 0.24),
              radius * 0.055,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
      }
      break;
    }

    case 'uk': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      if (country.code === 'GB') {
        // White diagonal
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = radius * 0.34;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + d, y0 + d);
        ctx.moveTo(x0 + d, y0);
        ctx.lineTo(x0, y0 + d);
        ctx.stroke();
        // Red diagonal
        ctx.strokeStyle = '#C8102E';
        ctx.lineWidth = radius * 0.16;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + d, y0 + d);
        ctx.moveTo(x0 + d, y0);
        ctx.lineTo(x0, y0 + d);
        ctx.stroke();
        // White St George cross
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx - radius * 0.24, y0, radius * 0.48, d);
        ctx.fillRect(x0, cy - radius * 0.24, d, radius * 0.48);
        // Red St George cross
        ctx.fillStyle = '#C8102E';
        ctx.fillRect(cx - radius * 0.14, y0, radius * 0.28, d);
        ctx.fillRect(x0, cy - radius * 0.14, d, radius * 0.28);
      } else {
        // Australia / New Zealand: Mini Union Jack in canton + Southern Cross stars
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = radius * 0.14;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(cx, cy);
        ctx.moveTo(cx, y0);
        ctx.lineTo(x0, cy);
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x0 + radius * 0.4, y0, radius * 0.2, radius);
        ctx.fillRect(x0, y0 + radius * 0.4, radius, radius * 0.2);
        ctx.fillStyle = '#C8102E';
        ctx.fillRect(x0 + radius * 0.44, y0, radius * 0.12, radius);
        ctx.fillRect(x0, y0 + radius * 0.44, radius, radius * 0.12);

        const starColor = country.code === 'NZ' ? '#CC142B' : '#FFFFFF';
        drawFivePointStar(ctx, cx + radius * 0.4, cy - radius * 0.35, radius * 0.14, starColor);
        drawFivePointStar(ctx, cx + radius * 0.4, cy + radius * 0.35, radius * 0.14, starColor);
        drawFivePointStar(ctx, cx + radius * 0.15, cy, radius * 0.13, starColor);
        drawFivePointStar(ctx, cx + radius * 0.62, cy - radius * 0.05, radius * 0.13, starColor);
        if (country.code === 'AU') {
          drawFivePointStar(ctx, x0 + radius * 0.5, cy + radius * 0.42, radius * 0.22, '#FFFFFF', 7);
        }
      }
      break;
    }

    case 'greece': {
      const stripes = 9;
      const sh = d / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? c[0] : c[1];
        ctx.fillRect(x0, y0 + i * sh, d, sh + 0.5);
      }
      const cw = sh * 5;
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, cw, cw);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0 + cw * 0.4, y0, cw * 0.2, cw);
      ctx.fillRect(x0, y0 + cw * 0.4, cw, cw * 0.2);
      break;
    }

    case 'cuba_pr': {
      const stripes = 5;
      const sh = d / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? c[0] : c[1];
        ctx.fillRect(x0, y0 + i * sh, d, sh + 0.5);
      }
      ctx.fillStyle = c[2];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx + radius * 0.15, cy);
      ctx.lineTo(x0, y0 + d);
      ctx.closePath();
      ctx.fill();
      drawFivePointStar(ctx, x0 + radius * 0.46, cy, radius * 0.22, '#FFFFFF');
      break;
    }

    case 'philippines': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, radius);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, cy, d, radius);
      ctx.fillStyle = c[2];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx + radius * 0.15, cy);
      ctx.lineTo(x0, y0 + d);
      ctx.closePath();
      ctx.fill();
      drawFivePointStar(ctx, x0 + radius * 0.48, cy, radius * 0.22, '#FCD116', 8);
      break;
    }

    case 'czech': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, radius);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, cy, d, radius);
      ctx.fillStyle = c[2];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx + radius * 0.1, cy);
      ctx.lineTo(x0, y0 + d);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'south_africa': {
      ctx.fillStyle = c[0]; // Red top
      ctx.fillRect(x0, y0, d, radius);
      ctx.fillStyle = c[1]; // Blue bottom
      ctx.fillRect(x0, cy, d, radius);
      // White outline Y
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = radius * 0.46;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx - radius * 0.05, cy);
      ctx.lineTo(x0, y0 + d);
      ctx.moveTo(cx - radius * 0.05, cy);
      ctx.lineTo(x0 + d, cy);
      ctx.stroke();
      // Green Y
      ctx.strokeStyle = c[2];
      ctx.lineWidth = radius * 0.3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(cx - radius * 0.05, cy);
      ctx.lineTo(x0, y0 + d);
      ctx.moveTo(cx - radius * 0.05, cy);
      ctx.lineTo(x0 + d, cy);
      ctx.stroke();
      // Left black triangle with gold edge
      ctx.fillStyle = c[3];
      ctx.beginPath();
      ctx.moveTo(x0, y0 + radius * 0.25);
      ctx.lineTo(cx - radius * 0.25, cy);
      ctx.lineTo(x0, y0 + d - radius * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.moveTo(x0, y0 + radius * 0.38);
      ctx.lineTo(cx - radius * 0.4, cy);
      ctx.lineTo(x0, y0 + d - radius * 0.38);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'tanzania': {
      ctx.fillStyle = c[0]; // Green top-left
      ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = c[1]; // Blue bottom-right
      ctx.beginPath();
      ctx.moveTo(x0 + d, y0);
      ctx.lineTo(x0 + d, y0 + d);
      ctx.lineTo(x0, y0 + d);
      ctx.closePath();
      ctx.fill();
      // Yellow + Black diagonal
      ctx.strokeStyle = c[3];
      ctx.lineWidth = radius * 0.44;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + d);
      ctx.lineTo(x0 + d, y0);
      ctx.stroke();
      ctx.strokeStyle = c[2];
      ctx.lineWidth = radius * 0.28;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + d);
      ctx.lineTo(x0 + d, y0);
      ctx.stroke();
      break;
    }

    case 'crescent_star': {
      if (country.code === 'PK') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x0, y0, d * 0.26, d);
        ctx.fillStyle = c[0];
        ctx.fillRect(x0 + d * 0.26, y0, d * 0.74, d);
        drawCrescentAndStar(ctx, cx + radius * 0.12, cy, radius * 0.36, '#FFFFFF', c[0]);
      } else {
        ctx.fillStyle = c[0];
        ctx.fillRect(x0, y0, d, d);
        drawCrescentAndStar(ctx, cx - radius * 0.1, cy, radius * 0.38, c[1], c[0]);
      }
      break;
    }

    case 'saudi': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      ctx.fillStyle = c[1];
      // Stylized white inscription & sword bar
      ctx.fillRect(cx - radius * 0.5, cy - radius * 0.22, radius * 1.0, radius * 0.14);
      ctx.fillRect(cx - radius * 0.42, cy + radius * 0.12, radius * 0.84, radius * 0.09);
      break;
    }

    case 'kenya': {
      const h = d / 3;
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, h);
      ctx.fillStyle = c[1];
      ctx.fillRect(x0, y0 + h, d, h);
      ctx.fillStyle = c[2];
      ctx.fillRect(x0, y0 + h * 2, d, h);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x0, y0 + h - 2, d, 4);
      ctx.fillRect(x0, y0 + h * 2 - 2, d, 4);
      // Maasai shield
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 0.2, radius * 0.36, 0, 0, Math.PI * 2);
      ctx.fillStyle = c[1];
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }

    case 'kazakhstan': {
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      drawFivePointStar(ctx, cx, cy, radius * 0.4, c[1], 12);
      break;
    }

    case 'uruguay': {
      const stripes = 9;
      const sh = d / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? c[0] : c[1];
        ctx.fillRect(x0, y0 + i * sh, d, sh + 0.5);
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x0, y0, radius, radius);
      drawFivePointStar(ctx, x0 + radius * 0.52, y0 + radius * 0.52, radius * 0.26, '#FCD116', 10);
      break;
    }

    case 'nepal': {
      // Deep midnight field + iconic crimson double-pennon with blue border & white sun/crescent
      ctx.fillStyle = c[0];
      ctx.fillRect(x0, y0, d, d);
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.45, y0 + radius * 0.22);
      ctx.lineTo(cx + radius * 0.5, cy);
      ctx.lineTo(cx - radius * 0.1, cy);
      ctx.lineTo(cx + radius * 0.55, y0 + d - radius * 0.22);
      ctx.lineTo(cx - radius * 0.45, y0 + d - radius * 0.22);
      ctx.closePath();
      ctx.fillStyle = c[1];
      ctx.fill();
      ctx.strokeStyle = c[2];
      ctx.lineWidth = Math.max(2, radius * 0.1);
      ctx.stroke();
      drawFivePointStar(ctx, cx - radius * 0.16, cy - radius * 0.24, radius * 0.14, '#FFFFFF', 8);
      drawFivePointStar(ctx, cx - radius * 0.12, cy + radius * 0.3, radius * 0.16, '#FFFFFF', 10);
      break;
    }
  }

  // Subtle top-left glass specular sheen for physical broadcast token feel
  const gloss = ctx.createLinearGradient(x0, y0, cx + radius * 0.5, cy + radius * 0.5);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  gloss.addColorStop(0.45, 'rgba(255, 255, 255, 0.04)');
  gloss.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  ctx.fillStyle = gloss;
  ctx.fillRect(x0, y0, d, d);

  ctx.restore();
}
