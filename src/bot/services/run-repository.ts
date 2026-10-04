import { Effect } from 'effect';

export const runRepository = <A>(effect: Effect.Effect<A, Error>) => {
    return Effect.runPromise(effect);
};
