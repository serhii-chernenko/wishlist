import { callSafely, getLaunchContext, supportsNative } from './sdk';
import type { HapticImpactStyle, HapticNotificationType } from './types';

const withHaptics = (
    action: (feedback: NonNullable<ReturnType<typeof getFeedback>>) => void
) => {
    const feedback = getFeedback();

    if (feedback !== null) {
        callSafely(() => {
            action(feedback);
        });
    }
};

const getFeedback = () => {
    const { webApp } = getLaunchContext();

    return webApp !== null && supportsNative('haptics')
        ? webApp.HapticFeedback
        : null;
};

export const haptics = {
    selection() {
        withHaptics(feedback => {
            feedback.selectionChanged();
        });
    },
    impact(style: HapticImpactStyle = 'light') {
        withHaptics(feedback => {
            feedback.impactOccurred(style);
        });
    },
    notify(type: HapticNotificationType) {
        withHaptics(feedback => {
            feedback.notificationOccurred(type);
        });
    },
    success() {
        haptics.notify('success');
    },
    warning() {
        haptics.notify('warning');
    },
    error() {
        haptics.notify('error');
    }
};
