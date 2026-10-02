import type { Repositories, UserRecord } from '../../db/repositories';
import { parseFindQuery } from '../input/find-query';
import { runRepository } from './run-repository';

type SearchRepositories = Pick<Repositories, 'users'>;

export type SearchOutcome =
    | { status: 'found'; user: UserRecord }
    | { status: 'notFound' }
    | { status: 'self' };

export interface SearchRequest {
    query: string;
    searcherId: number;
    searcherIsAdmin: boolean;
}

export const createSearchService = (repositories: SearchRepositories) => {
    return {
        async findByQuery(request: SearchRequest): Promise<SearchOutcome> {
            const parsed = parseFindQuery(request.query);

            if (parsed === null) {
                return { status: 'notFound' };
            }

            const user = await runRepository(
                repositories.users.findSearchable({
                    username: parsed.username ?? undefined,
                    phoneDigits: parsed.phoneDigits ?? undefined
                })
            );

            if (user === null) {
                return { status: 'notFound' };
            }

            if (user.id === request.searcherId && !request.searcherIsAdmin) {
                return { status: 'self' };
            }

            return { status: 'found', user };
        },
        findById(userId: number) {
            return runRepository(repositories.users.findById(userId));
        }
    };
};

export type SearchService = ReturnType<typeof createSearchService>;
