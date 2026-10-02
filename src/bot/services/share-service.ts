import type { Repositories, UserRecord } from '../../db/repositories';
import type { TranslationFunctions } from '../../i18n/i18n-types';
import {
    createTelegraphClient,
    TELEGRAPH_INVALID_TOKEN_ERROR,
    TelegraphError,
    type TelegraphClient
} from '../telegraph/client';
import {
    buildShareContent,
    type ShareDonateLink
} from '../telegraph/share-content';
import { runRepository } from './run-repository';

type ShareRepositories = Pick<Repositories, 'wishes' | 'users'>;

export const FALLBACK_TELEGRAPH_SHORT_NAME = 'wishlist';

export interface ShareAuthor {
    username: string | null;
    displayName: string;
}

export interface ShareRequest {
    user: Pick<UserRecord, 'id' | 'payments' | 'telegraphAccessToken'>;
    author: ShareAuthor;
    LL: TranslationFunctions;
    formatMoney: (value: number) => string;
    formatDate: (value: Date) => string;
    botUrl: string;
    donateLinks: readonly ShareDonateLink[];
}

export type ShareOutcome =
    | { status: 'published'; url: string }
    | { status: 'empty' };

export const buildAuthorName = (person: {
    username?: string | undefined;
    first_name?: string | undefined;
    last_name?: string | undefined;
}) => {
    const fullName = [person.first_name, person.last_name]
        .filter(Boolean)
        .join(' ');

    if (fullName) {
        return fullName;
    }

    return person.username ? `@${person.username}` : '';
};

export const createShareService = (
    repositories: ShareRepositories,
    client: TelegraphClient = createTelegraphClient(),
    clock: () => Date = () => new Date()
) => {
    const createAccount = async (userId: number, author: ShareAuthor) => {
        const accessToken = await client.createAccount({
            shortName: author.username ?? FALLBACK_TELEGRAPH_SHORT_NAME,
            authorName: author.displayName,
            ...(author.username
                ? { authorUrl: `https://t.me/${author.username}` }
                : {})
        });

        await runRepository(
            repositories.users.setTelegraphToken(userId, accessToken, clock())
        );

        return accessToken;
    };

    return {
        async publishWishlist(request: ShareRequest): Promise<ShareOutcome> {
            const wishes = await runRepository(
                repositories.wishes.listShareable(request.user.id)
            );

            if (wishes.length === 0) {
                return { status: 'empty' };
            }

            const { nodes } = buildShareContent({
                LL: request.LL,
                wishes,
                payments: request.user.payments,
                formatMoney: request.formatMoney,
                formatDate: request.formatDate,
                botUrl: request.botUrl,
                donateLinks: request.donateLinks
            });
            const publishWith = (accessToken: string) => {
                return client.createPage({
                    accessToken,
                    title: request.LL.share.title({
                        name: request.author.displayName
                    }),
                    authorName: request.author.displayName,
                    ...(request.author.username
                        ? {
                              authorUrl: `https://t.me/${request.author.username}`
                          }
                        : {}),
                    content: nodes
                });
            };
            const existingToken = request.user.telegraphAccessToken;
            const initialToken =
                existingToken ||
                (await createAccount(request.user.id, request.author));

            try {
                return {
                    status: 'published',
                    url: (await publishWith(initialToken)).url
                };
            } catch (error) {
                const isInvalidToken =
                    error instanceof TelegraphError &&
                    error.code === TELEGRAPH_INVALID_TOKEN_ERROR;

                if (!isInvalidToken) {
                    throw error;
                }
            }

            const recreatedToken = await createAccount(
                request.user.id,
                request.author
            );

            return {
                status: 'published',
                url: (await publishWith(recreatedToken)).url
            };
        }
    };
};

export type ShareService = ReturnType<typeof createShareService>;
