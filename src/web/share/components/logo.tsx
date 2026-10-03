import {
    LOGO_BOX_FILL,
    LOGO_HEART_FILL,
    LOGO_PATHS,
    LOGO_STROKE_MITERLIMIT,
    LOGO_STROKE_WIDTH,
    LOGO_VIEW_BOX
} from '../../../shared/logo';

export const HEART_PATH =
    'M0 58 C-92 6 -104 -74 -52 -94 C-24 -105 -4 -88 0 -66 C4 -88 24 -105 52 -94 C104 -74 92 6 0 58 Z';

const INK = 'currentColor';

export const heartSymbolId = (idPrefix: string) => {
    return `${idPrefix}-heart`;
};

export const LogoMark = ({
    idPrefix,
    class: className
}: {
    idPrefix: string;
    class: string;
}) => {
    return (
        <svg class={className} viewBox={LOGO_VIEW_BOX} aria-hidden='true'>
            <defs>
                <path id={heartSymbolId(idPrefix)} d={HEART_PATH} />
            </defs>
            <path d={LOGO_PATHS[0]} fill={LOGO_BOX_FILL} />
            <path d={LOGO_PATHS[1]} fill={INK} />
            <path d={LOGO_PATHS[2]} fill={LOGO_HEART_FILL} />
            <path d={LOGO_PATHS[3]} fill={INK} />
            <path
                d={LOGO_PATHS[4]}
                fill='none'
                stroke={INK}
                stroke-miterlimit={LOGO_STROKE_MITERLIMIT}
                stroke-width={LOGO_STROKE_WIDTH}
            />
            <path
                d={LOGO_PATHS[5]}
                fill='none'
                stroke={INK}
                stroke-miterlimit={LOGO_STROKE_MITERLIMIT}
                stroke-width={LOGO_STROKE_WIDTH}
            />
        </svg>
    );
};
