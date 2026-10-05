import {
    LOGO_STROKE_MITERLIMIT,
    LOGO_STROKE_WIDTH,
    LOGO_VIEW_BOX
} from '../../shared/logo';
import {
    PLACEHOLDER_HEIGHT,
    PLACEHOLDER_LAYERS,
    PLACEHOLDER_LOGO_FRAME,
    PLACEHOLDER_WIDTH,
    type PlaceholderTone
} from '../../shared/photo-placeholder';

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

/** The grey logo silhouette shown in place of a photo that failed to load, is missing or is still importing; colours come from the `--photo-placeholder-*` tokens, so it follows the active theme. Without a `label` it is decorative. */
export const PhotoPlaceholder = ({ label }: { label?: string }) => {
    return (
        <svg
            class='photo-placeholder'
            viewBox={`0 0 ${PLACEHOLDER_WIDTH} ${PLACEHOLDER_HEIGHT}`}
            preserveAspectRatio='xMidYMid slice'
            focusable='false'
            {...(label === undefined
                ? { 'aria-hidden': 'true' }
                : { role: 'img', 'aria-label': label })}
        >
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
                            key={path}
                            class={TONE_CLASS[tone]}
                            d={path}
                            {...(tone === 'stroke' ? STROKE_ATTRIBUTES : {})}
                        />
                    );
                })}
            </svg>
        </svg>
    );
};
