import { HERO_LOGO_ID_PREFIX } from './hero';
import { heartSymbolId } from './logo';

const HEART_HREF = `#${heartSymbolId(HERO_LOGO_ID_PREFIX)}`;
const STICKER_ID = 'wl-sticker';
const STICKER_VIEW_BOX = '-125 -124 250 206';

/** Draws the layered heart once, so each high-priority card only references it with `<use>`. */
export const HeartStickerDefs = () => {
    return (
        <svg class='sr-only' aria-hidden='true' focusable='false'>
            <defs>
                <symbol
                    id={STICKER_ID}
                    class='sticker'
                    viewBox={STICKER_VIEW_BOX}
                >
                    <use href={HEART_HREF} class='sticker-halo' />
                    <use href={HEART_HREF} class='sticker-fill' />
                </symbol>
            </defs>
        </svg>
    );
};

export const HeartSticker = () => {
    return (
        <svg class='wish-heart' aria-hidden='true'>
            <use href={`#${STICKER_ID}`} />
        </svg>
    );
};
