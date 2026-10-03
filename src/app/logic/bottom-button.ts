export interface BottomButtonConfig {
    text: string;
    onClick: () => void;
    disabled?: boolean;
    progress?: boolean;
}

export type BottomButtonState = Omit<BottomButtonConfig, 'onClick'> & {
    owner: number;
};

export interface BottomButtonSlot {
    get(): BottomButtonState | null;
    set(
        next:
            | BottomButtonState
            | null
            | ((current: BottomButtonState | null) => BottomButtonState | null)
    ): void;
}

const sameState = (
    left: BottomButtonState | null,
    right: BottomButtonState | null
) => {
    return (
        left === right ||
        (left !== null &&
            right !== null &&
            left.owner === right.owner &&
            left.text === right.text &&
            Boolean(left.disabled) === Boolean(right.disabled) &&
            Boolean(left.progress) === Boolean(right.progress))
    );
};

export const createBottomButtonRegistry = (slot: BottomButtonSlot) => {
    const handlers = new Map<number, () => void>();
    let nextOwner = 1;

    return {
        allocateOwner() {
            const owner = nextOwner;

            nextOwner += 1;

            return owner;
        },
        register(owner: number, onTrigger: () => void) {
            handlers.set(owner, onTrigger);

            return () => {
                handlers.delete(owner);
                slot.set(current => {
                    return current?.owner === owner ? null : current;
                });
            };
        },
        publish(owner: number, config: BottomButtonConfig | null) {
            if (!handlers.has(owner)) {
                return;
            }

            const next: BottomButtonState | null =
                config === null
                    ? null
                    : {
                          owner,
                          text: config.text,
                          ...(config.disabled !== undefined && {
                              disabled: config.disabled
                          }),
                          ...(config.progress !== undefined && {
                              progress: config.progress
                          })
                      };

            slot.set(current => {
                if (next === null) {
                    return current?.owner === owner ? null : current;
                }

                return sameState(current, next) ? current : next;
            });
        },
        trigger() {
            const state = slot.get();

            if (state !== null && !state.disabled && !state.progress) {
                handlers.get(state.owner)?.();
            }
        }
    };
};
