export const HEART_PATH =
    'M0 58 C-92 6 -104 -74 -52 -94 C-24 -105 -4 -88 0 -66 C4 -88 24 -105 52 -94 C104 -74 92 6 0 58 Z';

const LOGO_HEART_TRANSFORM = 'translate(186 362) rotate(-10) scale(0.9)';
const HEART_FILL = '#F57AA6';
const LID_FILL = '#7FD0F2';
const BOX_FILL = '#2AABE2';

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
    const heartId = heartSymbolId(idPrefix);
    const cutId = `${idPrefix}-cut`;

    return (
        <svg class={className} viewBox='0 0 512 512' aria-hidden='true'>
            <defs>
                <path id={heartId} d={HEART_PATH} />
                <mask id={cutId}>
                    <rect width='512' height='512' fill='#fff' />
                    <use
                        href={`#${heartId}`}
                        transform={LOGO_HEART_TRANSFORM}
                        fill='#000'
                        stroke='#000'
                        stroke-width='84'
                        stroke-linejoin='round'
                    />
                </mask>
            </defs>
            <g
                stroke='currentColor'
                stroke-width='20'
                stroke-linejoin='round'
                stroke-linecap='round'
            >
                <g mask={`url(#${cutId})`}>
                    <path
                        d='M282 170 C246 166 184 136 198 98 C212 60 268 96 282 170 Z'
                        fill={HEART_FILL}
                    />
                    <path
                        d='M282 170 C318 166 380 136 366 98 C352 60 296 96 282 170 Z'
                        fill={HEART_FILL}
                    />
                    <rect
                        x='164'
                        y='234'
                        width='236'
                        height='200'
                        rx='26'
                        fill={BOX_FILL}
                    />
                    <rect
                        x='148'
                        y='178'
                        width='268'
                        height='66'
                        rx='20'
                        fill={LID_FILL}
                    />
                    <rect
                        x='262'
                        y='178'
                        width='40'
                        height='256'
                        rx='4'
                        fill={HEART_FILL}
                    />
                    <rect
                        x='266'
                        y='152'
                        width='32'
                        height='30'
                        rx='10'
                        fill={HEART_FILL}
                    />
                </g>
                <use
                    href={`#${heartId}`}
                    transform={LOGO_HEART_TRANSFORM}
                    fill={HEART_FILL}
                />
            </g>
        </svg>
    );
};
