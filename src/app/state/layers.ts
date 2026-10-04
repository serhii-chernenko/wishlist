import { createStore, type Store } from './store';

type DismissLayer = () => void;

/** Open overlays that the Telegram back button closes before it navigates. */
export const dismissibleLayers: Store<readonly DismissLayer[]> = createStore<
    readonly DismissLayer[]
>([]);

export const pushDismissibleLayer = (dismiss: DismissLayer) => {
    dismissibleLayers.set(layers => [...layers, dismiss]);

    return () => {
        dismissibleLayers.set(layers => {
            return layers.filter(layer => layer !== dismiss);
        });
    };
};

export const dismissTopLayer = () => {
    const layers = dismissibleLayers.get();
    const top = layers[layers.length - 1];

    if (top === undefined) {
        return false;
    }

    top();

    return true;
};
