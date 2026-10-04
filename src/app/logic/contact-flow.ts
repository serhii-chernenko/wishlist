import {
    APP_CONTACT_POLL_INTERVAL_MS,
    APP_CONTACT_POLL_TIMEOUT_MS,
    type ContactVisibilityType,
    type MeDto
} from '../../shared/app-api';
import type { AppFailure } from './errors';

export type ContactRequestOutcome = 'sent' | 'cancelled' | 'unsupported';

export type ContactFlowState =
    | { phase: 'idle' }
    | { phase: 'intent'; type: ContactVisibilityType }
    | { phase: 'requesting'; type: ContactVisibilityType }
    | {
          phase: 'polling';
          type: ContactVisibilityType;
          startedAt: number;
          attempts: number;
      }
    | {
          phase: 'cancelling';
          type: ContactVisibilityType;
          reason: 'cancelled' | 'unsupported';
      }
    | { phase: 'success'; type: ContactVisibilityType; me: MeDto }
    | { phase: 'cancelled'; type: ContactVisibilityType }
    | { phase: 'unsupported'; type: ContactVisibilityType }
    | { phase: 'timeout'; type: ContactVisibilityType }
    | { phase: 'failed'; type: ContactVisibilityType; failure: AppFailure };

export type ContactFlowEvent =
    | { kind: 'start'; type: ContactVisibilityType }
    | { kind: 'intentSaved' }
    | { kind: 'intentFailed'; failure: AppFailure }
    | { kind: 'contactResult'; outcome: ContactRequestOutcome; now: number }
    | { kind: 'intentCancelled' }
    | { kind: 'polled'; me: MeDto | null; now: number }
    | { kind: 'reset' };

export type ContactFlowEffect =
    | 'saveIntent'
    | 'requestContact'
    | 'cancelIntent'
    | 'pollMe';

export const INITIAL_CONTACT_FLOW: ContactFlowState = { phase: 'idle' };

const BUSY_PHASES: ReadonlySet<ContactFlowState['phase']> = new Set([
    'intent',
    'requesting',
    'polling',
    'cancelling'
]);

export const isContactFlowBusy = (state: ContactFlowState) => {
    return BUSY_PHASES.has(state.phase);
};

export const isContactCompleted = (
    me: MeDto | null,
    type: ContactVisibilityType
) => {
    return me !== null && me.visibility === type;
};

export const isPollExpired = (startedAt: number, now: number) => {
    return now - startedAt >= APP_CONTACT_POLL_TIMEOUT_MS;
};

const getFlowType = (state: ContactFlowState) => {
    return state.phase === 'idle' ? null : state.type;
};

export const reduceContactFlow = (
    state: ContactFlowState,
    event: ContactFlowEvent
): ContactFlowState => {
    if (event.kind === 'reset') {
        return INITIAL_CONTACT_FLOW;
    }

    if (event.kind === 'start') {
        return isContactFlowBusy(state)
            ? state
            : { phase: 'intent', type: event.type };
    }

    const type = getFlowType(state);

    if (type === null) {
        return state;
    }

    if (state.phase === 'intent') {
        if (event.kind === 'intentSaved') {
            return { phase: 'requesting', type };
        }

        return event.kind === 'intentFailed'
            ? { phase: 'failed', type, failure: event.failure }
            : state;
    }

    if (state.phase === 'requesting' && event.kind === 'contactResult') {
        return event.outcome === 'sent'
            ? { phase: 'polling', type, startedAt: event.now, attempts: 0 }
            : { phase: 'cancelling', type, reason: event.outcome };
    }

    if (state.phase === 'cancelling' && event.kind === 'intentCancelled') {
        return { phase: state.reason, type };
    }

    if (state.phase === 'polling' && event.kind === 'polled') {
        if (isContactCompleted(event.me, type) && event.me !== null) {
            return { phase: 'success', type, me: event.me };
        }

        return isPollExpired(state.startedAt, event.now)
            ? { phase: 'timeout', type }
            : { ...state, attempts: state.attempts + 1 };
    }

    return state;
};

export const getContactFlowEffect = (
    state: ContactFlowState
): ContactFlowEffect | null => {
    switch (state.phase) {
        case 'intent':
            return 'saveIntent';
        case 'requesting':
            return 'requestContact';
        case 'cancelling':
            return 'cancelIntent';
        case 'polling':
            return 'pollMe';
        default:
            return null;
    }
};

export interface ContactFlowDeps {
    saveIntent(type: ContactVisibilityType): Promise<void>;
    cancelIntent(): Promise<void>;
    requestContact(): Promise<ContactRequestOutcome>;
    fetchMe(): Promise<MeDto>;
    wait(milliseconds: number): Promise<void>;
    now(): number;
    toFailure(error: unknown): AppFailure;
}

export interface ContactFlowRun {
    deps: ContactFlowDeps;
    type: ContactVisibilityType;
    onState?: (state: ContactFlowState) => void;
    signal?: AbortSignal;
}

const swallow = () => undefined;

/** Drives the phone-visibility flow to a terminal state; an aborted signal stops polling and leaves the last state as is, so a contact that arrives later still completes in the chat. */
export const runContactFlow = async ({
    deps,
    type,
    onState,
    signal
}: ContactFlowRun): Promise<ContactFlowState> => {
    let state = reduceContactFlow(INITIAL_CONTACT_FLOW, {
        kind: 'start',
        type
    });

    const advance = (event: ContactFlowEvent) => {
        state = reduceContactFlow(state, event);
        onState?.(state);
    };

    const isAborted = () => signal?.aborted === true;

    onState?.(state);

    while (!isAborted()) {
        const effect = getContactFlowEffect(state);

        if (effect === null) {
            return state;
        }

        if (effect === 'saveIntent') {
            try {
                await deps.saveIntent(type);
                advance({ kind: 'intentSaved' });
            } catch (error) {
                advance({
                    kind: 'intentFailed',
                    failure: deps.toFailure(error)
                });
            }
        } else if (effect === 'requestContact') {
            advance({
                kind: 'contactResult',
                outcome: await deps.requestContact(),
                now: deps.now()
            });
        } else if (effect === 'cancelIntent') {
            await deps.cancelIntent().catch(swallow);
            advance({ kind: 'intentCancelled' });
        } else {
            await deps.wait(APP_CONTACT_POLL_INTERVAL_MS);

            if (isAborted()) {
                return state;
            }

            const me = await deps.fetchMe().catch(() => null);

            advance({ kind: 'polled', me, now: deps.now() });
        }
    }

    return state;
};
