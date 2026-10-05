import { Effect } from 'effect';

export const createTryDb = (repositoryName: string) => {
    return <A>(execute: () => Promise<A>) => {
        return Effect.tryPromise({
            try: () => execute(),
            catch: cause => {
                return new Error(`${repositoryName} failure`, { cause });
            }
        });
    };
};
