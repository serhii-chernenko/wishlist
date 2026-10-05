import {
    LOGO_STROKE_MITERLIMIT,
    LOGO_STROKE_WIDTH,
    LOGO_VIEW_BOX
} from '../../../shared/logo';
import {
    PLACEHOLDER_HEIGHT,
    PLACEHOLDER_LAYERS,
    PLACEHOLDER_LOGO_FRAME,
    PLACEHOLDER_WIDTH,
    type PlaceholderTone
} from '../../../shared/photo-placeholder';

export const PHOTO_PLACEHOLDER_ID = 'wl-photo-placeholder';

const TONE_CLASS: Record<PlaceholderTone, string> = {
    fill: 'photo-placeholder-fill',
    line: 'photo-placeholder-line',
    stroke: 'photo-placeholder-stroke'
};

const STROKE_ATTRIBUTES = {
    fill: 'none',
    'stroke-miterlimit': LOGO_STROKE_MITERLIMIT,
    'stroke-width': LOGO_STROKE_WIDTH
} as const;

/** Draws the logo placeholder once per page; every card repeats it through `PhotoPlaceholderReference`, so its path data is sent only once. */
export const PhotoPlaceholderSprite = () => {
    return (
        <svg
            class='sr-only'
            width='0'
            height='0'
            aria-hidden='true'
            focusable='false'
        >
            <defs>
                <g id={PHOTO_PLACEHOLDER_ID}>
                    <rect
                        class='photo-placeholder-background'
                        width={PLACEHOLDER_WIDTH}
                        height={PLACEHOLDER_HEIGHT}
                    />
                    <svg
                        x={PLACEHOLDER_LOGO_FRAME.x}
                        y={PLACEHOLDER_LOGO_FRAME.y}
                        width={PLACEHOLDER_LOGO_FRAME.size}
                        height={PLACEHOLDER_LOGO_FRAME.size}
                        viewBox={LOGO_VIEW_BOX}
                    >
                        {PLACEHOLDER_LAYERS.map(({ path, tone }) => {
                            return (
                                <path
                                    class={TONE_CLASS[tone]}
                                    d={path}
                                    {...(tone === 'stroke'
                                        ? STROKE_ATTRIBUTES
                                        : {})}
                                />
                            );
                        })}
                    </svg>
                </g>
            </defs>
        </svg>
    );
};

export const PhotoPlaceholderReference = () => {
    return (
        <svg
            class='photo-placeholder'
            viewBox={`0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}`}
            preserveAspectRatio='xMidYMid slice'
            aria-hidden='true'
            focusable='false'
        >
            <use href={`#${PHOTO_PLACEHOLDER_ID}`} />
        </svg>
    );
};
