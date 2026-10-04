import {
    LOGO_PATHS,
    LOGO_STROKE_MITERLIMIT,
    LOGO_STROKE_WIDTH,
    LOGO_VIEW_BOX
} from './logo';

export type PlaceholderTone = 'fill' | 'line' | 'stroke';

export type PlaceholderTheme = 'light' | 'dark';

export interface PlaceholderPalette {
    background: string;
    fill: string;
    ink: string;
}

export interface PlaceholderLayer {
    path: string;
    tone: PlaceholderTone;
}

export const PLACEHOLDER_WIDTH = 400;
export const PLACEHOLDER_HEIGHT = 300;
export const PLACEHOLDER_LOGO_RATIO = 0.4;

export const PLACEHOLDER_LIGHT: PlaceholderPalette = {
    background: '#ececee',
    fill: '#dedee2',
    ink: '#b1b1ba'
};

export const PLACEHOLDER_DARK: PlaceholderPalette = {
    background: '#2a2131',
    fill: '#3d3248',
    ink: '#51445e'
};

const PALETTES: Record<PlaceholderTheme, PlaceholderPalette> = {
    light: PLACEHOLDER_LIGHT,
    dark: PLACEHOLDER_DARK
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

const renderLayer = (palette: PlaceholderPalette, layer: PlaceholderLayer) => {
    const { path, tone } = layer;

    return tone === 'stroke'
        ? `<path class="s" d="${path}" fill="none" stroke="${palette.ink}" stroke-miterlimit="${LOGO_STROKE_MITERLIMIT}" stroke-width="${LOGO_STROKE_WIDTH}"/>`
        : `<path class="${TONE_CLASS[tone]}" d="${path}" fill="${tone === 'fill' ? palette.fill : palette.ink}"/>`;
};

const ADAPTIVE_STYLE = `<style>@media (prefers-color-scheme:dark){.b{fill:${PLACEHOLDER_DARK.background}}.f{fill:${PLACEHOLDER_DARK.fill}}.l{fill:${PLACEHOLDER_DARK.ink}}.s{stroke:${PLACEHOLDER_DARK.ink}}}</style>`;

/**
 * Standalone placeholder image. Without a theme it is light and turns dark through a media query; with one it carries that palette only.
 * Contains no scripts, links or identifiers.
 */
export const buildPhotoPlaceholderSvg = (theme?: PlaceholderTheme) => {
    const palette = PALETTES[theme ?? 'light'];

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}" viewBox="0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}">`,
        theme === undefined ? ADAPTIVE_STYLE : '',
        `<rect class="b" width="${PLACEHOLDER_WIDTH}" height="${PLACEHOLDER_HEIGHT}" fill="${palette.background}"/>`,
        `<svg x="${PLACEHOLDER_LOGO_FRAME.x}" y="${PLACEHOLDER_LOGO_FRAME.y}" width="${PLACEHOLDER_LOGO_FRAME.size}" height="${PLACEHOLDER_LOGO_FRAME.size}" viewBox="${LOGO_VIEW_BOX}">`,
        ...PLACEHOLDER_LAYERS.map(layer => {
            return renderLayer(palette, layer);
        }),
        '</svg>',
        '</svg>'
    ].join('');
};
