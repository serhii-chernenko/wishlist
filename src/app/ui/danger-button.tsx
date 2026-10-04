import { useEffect, useState } from 'hono/jsx/dom';
import { Trash2 } from 'lucide';

import {
    createCountdown,
    DESTRUCTIVE_COUNTDOWN_SECONDS
} from '../logic/countdown';
import { useLL } from '../state/context';
import { useLatest } from '../state/store';
import { haptics } from '../telegram/haptics';
import { Icon, type IconNode } from './icon';
import { announce } from './toast';

export interface DangerButtonProps {
    label: string;
    onCommit: () => void;
    icon?: IconNode;
    compact?: boolean;
    disabled?: boolean;
    class?: string;
    onCountdownChange?: (running: boolean) => void;
}

const joinClasses = (classes: readonly (string | false | undefined)[]) => {
    return classes.filter(Boolean).join(' ');
};

/** A destructive button that turns into a cancel countdown on the first tap and runs `onCommit` when it reaches zero. */
export const DangerButton = (props: DangerButtonProps) => {
    const LL = useLL();
    const latest = useLatest(props);
    const [seconds, setSeconds] = useState<number | null>(null);
    const [countdown] = useState(() => {
        return createCountdown({
            onTick: setSeconds,
            onCommit: () => {
                setSeconds(null);
                latest.current.onCountdownChange?.(false);
                haptics.success();
                latest.current.onCommit();
            }
        });
    });

    useEffect(() => {
        return () => {
            if (countdown.cancel()) {
                latest.current.onCountdownChange?.(false);
            }
        };
    }, []);

    const toggle = () => {
        if (countdown.cancel()) {
            setSeconds(null);
            latest.current.onCountdownChange?.(false);
            haptics.selection();
            announce(LL.a11y.countdown.cancelled());

            return;
        }

        haptics.warning();
        announce(
            LL.a11y.countdown.started({
                seconds: DESTRUCTIVE_COUNTDOWN_SECONDS
            })
        );
        latest.current.onCountdownChange?.(true);
        countdown.start();
    };

    const { label, icon = Trash2, compact = false } = props;
    const counting = seconds !== null;
    const cancelLabel = LL.common.cancel();

    return (
        <button
            type='button'
            class={joinClasses([
                'danger-button',
                compact ? 'danger-button-compact' : 'btn',
                counting && 'danger-button-counting',
                props.class
            ])}
            disabled={props.disabled === true && !counting}
            aria-label={compact ? (counting ? cancelLabel : label) : undefined}
            onClick={toggle}
        >
            {counting ? null : <Icon icon={icon} />}
            {compact ? null : counting ? cancelLabel : label}
            {counting ? (
                <span class='countdown-count' aria-hidden='true'>
                    {seconds}
                </span>
            ) : null}
        </button>
    );
};
