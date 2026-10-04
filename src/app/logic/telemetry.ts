import type { ClientEventKind, ClientScreen } from '../../shared/app-api';

export const CLIENT_EVENT_INTERVAL_MS = 2000;

export interface GatedEvent {
    kind: ClientEventKind;
    screen: ClientScreen;
}

/** Decides which client events are worth sending: no repeated view of the screen already shown, and at most one event of a kind per screen every `intervalMs`. */
export const createTelemetryGate = (
    intervalMs: number = CLIENT_EVENT_INTERVAL_MS
) => {
    const lastSentAt = new Map<string, number>();
    let lastView: ClientScreen | null = null;

    return {
        allow(event: GatedEvent, now: number) {
            if (event.kind === 'screenView' && event.screen === lastView) {
                return false;
            }

            const key = `${event.kind}:${event.screen}`;
            const previous = lastSentAt.get(key);

            if (previous !== undefined && now - previous < intervalMs) {
                return false;
            }

            lastSentAt.set(key, now);

            if (event.kind === 'screenView') {
                lastView = event.screen;
            }

            return true;
        }
    };
};
