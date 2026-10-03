import { useStore } from '../state/store';
import {
    bottomButtonStore,
    isNativeBottomButton,
    triggerBottomButton
} from '../telegram/buttons';

/** In-page stand-in for the Telegram BottomButton (old clients, `platform === 'unknown'`, the headless smoke). */
export const BottomBarFallback = () => {
    const state = useStore(bottomButtonStore);

    if (state === null || isNativeBottomButton()) {
        return null;
    }

    return (
        <>
            <div class='bottom-bar-spacer' aria-hidden='true' />
            <div class='bottom-bar'>
                <button
                    type='button'
                    class='btn btn-primary bottom-bar-button'
                    data-bottom-button
                    disabled={
                        Boolean(state.disabled) || Boolean(state.progress)
                    }
                    aria-busy={String(Boolean(state.progress))}
                    onClick={triggerBottomButton}
                >
                    {state.progress ? (
                        <span
                            class='loading loading-spinner loading-sm'
                            aria-hidden='true'
                        />
                    ) : null}
                    {state.text}
                </button>
            </div>
        </>
    );
};
