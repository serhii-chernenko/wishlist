import type { Repositories, UserRecord } from '../../db/repositories';
import { parseFindQuery } from '../input/find-query';
import type { AppLocale } from '../../shared/app-api';
import { runRepository } from './run-repository';

type SearchRepositories = Pick<Repositories, 'users'>;

export type SearchOutcome =
    | { status: 'found'; user: UserRecord }
    | { status: 'notFound' }
    | { status: 'needsCountryCode' }
    | { status: 'self' };

export interface SearchRequest {
    query: string;
    searcherId: number;
    searcherIsAdmin: boolean;
    searcherLocale: AppLocale;
    searcherCurrency: string;
}

export const createSearchService = (repositories: SearchRepositories) => {
    return {
        async findByQuery(request: SearchRequest): Promise<SearchOutcome> {
            const parsed = parseFindQuery(request.query, {
                locale: request.searcherLocale,
                currency: request.searcherCurrency
            });

            if (parsed === null) {
                return { status: 'notFound' };
            }

            if (parsed.phone.kind === 'needsCountryCode') {
                return { status: 'needsCountryCode' };
            }

            const user = await runRepository(
                repositories.users.findSearchable({
                    username: parsed.username ?? undefined,
                    phoneDigits:
                        parsed.phone.kind === 'digits'
                            ? parsed.phone.digits
                            : undefined
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
