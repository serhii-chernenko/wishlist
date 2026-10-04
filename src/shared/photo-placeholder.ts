import {
    LOGO_PATHS,
    LOGO_STROKE_MITERLIMIT,
    LOGO_STROKE_WIDTH,
    LOGO_VIEW_BOX
} from './logo';

export type PlaceholderTone = 'fill' | 'line' | 'stroke';

export interface PlaceholderPalette {
    background: string;
    fill: string;
    line: string;
}

export interface PlaceholderLayer {
    path: string;
    tone: PlaceholderTone;
}

export const PLACEHOLDER_WIDTH = 400;
export const PLACEHOLDER_HEIGHT = 300;
export const PLACEHOLDER_LOGO_RATIO = 0.4;

export const PLACEHOLDER_LIGHT: PlaceholderPalette = {
    background: '#ece6f1',
    fill: '#d9d1e1',
    line: '#c6bcd2'
};

export const PLACEHOLDER_DARK: PlaceholderPalette = {
    background: '#2a2131',
    fill: '#3d3248',
    line: '#51445e'
};

const [BOX, BOX_OUTLINE, HEART, HEART_OUTLINE, LEFT_LOOP, RIGHT_LOOP] =
    LOGO_PATHS;

export const PLACEHOLDER_LAYERS: readonly PlaceholderLayer[] = [
    { path: BOX, tone: 'fill' },
    { path: BOX_OUTLINE, tone: 'line' },
    { path: HEART, tone: 'fill' },
    { path: HEART_OUTLINE, tone: 'line' },
    { path: LEFT_LOOP, tone: 'stroke' },
    { path: RIGHT_LOOP, tone: 'stroke' }
];

const LOGO_SIZE =
    Math.min(PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT) * PLACEHOLDER_LOGO_RATIO;

export const PLACEHOLDER_LOGO_FRAME = {
    x: (PLACEHOLDER_WIDTH - LOGO_SIZE) / 2,
    y: (PLACEHOLDER_HEIGHT - LOGO_SIZE) / 2,
    size: LOGO_SIZE
} as const;

const TONE_CLASS: Record<PlaceholderTone, string> = {
    fill: 'f',
    line: 'l',
    stroke: 's'
};

const renderLayer = ({ path, tone }: PlaceholderLayer) => {
    return tone === 'stroke'
        ? `<path class="s" d="${path}" fill="none" stroke="${PLACEHOLDER_LIGHT.line}" stroke-miterlimit="${LOGO_STROKE_MITERLIMIT}" stroke-width="${LOGO_STROKE_WIDTH}"/>`
        : `<path class="${TONE_CLASS[tone]}" d="${path}" fill="${PLACEHOLDER_LIGHT[tone]}"/>`;
};

const DARK_STYLE = `@media (prefers-color-scheme:dark){.b{fill:${PLACEHOLDER_DARK.background}}.f{fill:${PLACEHOLDER_DARK.fill}}.l{fill:${PLACEHOLDER_DARK.line}}.s{stroke:${PLACEHOLDER_DARK.line}}}`;

/** Standalone placeholder image: light by default, dark through a media query. Contains no scripts, links or identifiers. */
export const buildPhotoPlaceholderSvg = () => {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}" viewBox="0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}">`,
        `<style>${DARK_STYLE}</style>`,
        `<rect class="b" width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}" fill="${PLACEHOLDER_LIGHT.background}"/>`,
        `<svg x="${PLACEHOLDER_LOGO_FRAME.x}" y="${PLACEHOLDER_LOGO_FRAME.y}" width="${PLACEHOLDER_LOGO_FRAME.size}" height="${PLACEHOLDER_LOGO_FRAME.size}" viewBox="${LOGO_VIEW_BOX}">`,
        ...PLACEHOLDER_LAYERS.map(renderLayer),
        '</svg>',
        '</svg>'
    ].join('');
};
