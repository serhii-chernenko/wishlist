export type NativeInvoker<Value> = (settle: (value: Value) => void) => boolean;

/** Wraps a callback-style native call so the promise always settles: with the callback value, or with `fallback` when the call is unavailable (`invoke` returns false) or throws. */
export const settleNativeCall = <Value>(
    invoke: NativeInvoker<Value>,
    fallback: Value
): Promise<Value> => {
    return new Promise<Value>(resolve => {
        let settled = false;
        const settle = (value: Value) => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };

        try {
            if (!invoke(settle)) {
                settle(fallback);
            }
        } catch {
            settle(fallback);
        }
    });
};
