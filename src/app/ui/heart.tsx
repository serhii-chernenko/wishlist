export const HEART_SYMBOL_ID = 'app-heart';

const HEART_PATH =
    'M0 58 C-92 6 -104 -74 -52 -94 C-24 -105 -4 -88 0 -66 C4 -88 24 -105 52 -94 C104 -74 92 6 0 58 Z';
const STICKER_VIEW_BOX = '-125 -124 250 206';
const HEART_HREF = `#${HEART_SYMBOL_ID}`;

/** Renders the shared heart path once so every sticker can reference it with `<use>`. */
export const HeartDefs = () => {
    return (
        <svg class='sr-only' aria-hidden='true' focusable='false'>
            <defs>
                <path id={HEART_SYMBOL_ID} d={HEART_PATH} />
            </defs>
        </svg>
    );
};

export const HeartSticker = ({ class: className }: { class?: string }) => {
    return (
        <svg
            class={
                className === undefined
                    ? 'wish-heart'
                    : `wish-heart ${className}`
            }
            viewBox={STICKER_VIEW_BOX}
            aria-hidden='true'
            focusable='false'
        >
            <use href={HEART_HREF} class='heart-halo' />
            <use href={HEART_HREF} class='heart-fill' />
        </svg>
    );
};
