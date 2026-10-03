import {
    LOGO_BOX_FILL,
    LOGO_HEART_FILL,
    LOGO_PATHS,
    LOGO_STROKE_MITERLIMIT,
    LOGO_STROKE_WIDTH,
    LOGO_VIEW_BOX
} from '../../shared/logo';

const INK = 'currentColor';

/** The site logo; outlines follow `currentColor`, so they are ink in the light theme and lavender in the dark one. */
export const AppLogo = ({ class: className }: { class: string }) => {
    const [box, boxOutline, heart, heartOutline, leftLoop, rightLoop] =
        LOGO_PATHS;

    return (
        <svg
            class={className}
            viewBox={LOGO_VIEW_BOX}
            aria-hidden='true'
            focusable='false'
        >
            <path d={box} fill={LOGO_BOX_FILL} />
            <path d={boxOutline} fill={INK} />
            <path d={heart} fill={LOGO_HEART_FILL} />
            <path d={heartOutline} fill={INK} />
            {[leftLoop, rightLoop].map(loop => {
                return (
                    <path
                        key={loop}
                        d={loop}
                        fill='none'
                        stroke={INK}
                        stroke-miterlimit={LOGO_STROKE_MITERLIMIT}
                        stroke-width={LOGO_STROKE_WIDTH}
                    />
                );
            })}
        </svg>
    );
};
