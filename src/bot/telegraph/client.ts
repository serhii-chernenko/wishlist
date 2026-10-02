import { cutText } from '../input/limits';
import type { TelegraphNode } from './nodes';

export const TELEGRAPH_API_URL = 'https://api.telegra.ph';
export const TELEGRAPH_REQUEST_TIMEOUT_MS = 15_000;
export const TELEGRAPH_INVALID_TOKEN_ERROR = 'ACCESS_TOKEN_INVALID';

const SHORT_NAME_MAX_LENGTH = 32;
const AUTHOR_NAME_MAX_LENGTH = 128;
const AUTHOR_URL_MAX_LENGTH = 512;
const TITLE_MAX_LENGTH = 256;

export class TelegraphError extends Error {
    readonly code: string | null;

    readonly status: number | null;

    constructor(
        message: string,
        options: { code?: string | null; status?: number | null } = {}
    ) {
        super(message);
        this.name = 'TelegraphError';
        this.code = options.code ?? null;
        this.status = options.status ?? null;
    }
}

export interface CreateAccountInput {
    shortName: string;
    authorName: string;
    authorUrl?: string;
}

export interface CreatePageInput {
    accessToken: string;
    title: string;
    authorName: string;
    authorUrl?: string;
    content: readonly TelegraphNode[];
}

export interface TelegraphClient {
    createAccount(input: CreateAccountInput): Promise<string>;
    createPage(input: CreatePageInput): Promise<{ url: string }>;
}

export interface TelegraphClientOptions {
    fetch?: typeof fetch;
    timeoutMs?: number;
    baseUrl?: string;
}

interface TelegraphEnvelope {
    ok?: unknown;
    error?: unknown;
    result?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const readEnvelope = async (response: Response): Promise<TelegraphEnvelope> => {
    try {
        const json: unknown = await response.json();

        return isRecord(json) ? json : {};
    } catch {
        return {};
    }
};

export const createTelegraphClient = (
    options: TelegraphClientOptions = {}
): TelegraphClient => {
    const fetchImplementation: typeof fetch =
        options.fetch ??
        ((input, init) => {
            return globalThis.fetch(input, init);
        });
    const timeoutMs = options.timeoutMs ?? TELEGRAPH_REQUEST_TIMEOUT_MS;
    const baseUrl = options.baseUrl ?? TELEGRAPH_API_URL;

    const call = async (method: string, body: Record<string, unknown>) => {
        const response = await fetchImplementation(`${baseUrl}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs)
        });
        const envelope = await readEnvelope(response);

        if (!response.ok || envelope.ok !== true) {
            const code =
                typeof envelope.error === 'string' ? envelope.error : null;

            throw new TelegraphError(
                `Telegraph ${method} failed: ${code ?? response.status}`,
                { code, status: response.status }
            );
        }

        if (!isRecord(envelope.result)) {
            throw new TelegraphError(`Telegraph ${method} returned no result`, {
                status: response.status
            });
        }

        return envelope.result;
    };

    return {
        async createAccount(input) {
            const body: Record<string, unknown> = {
                short_name: cutText(input.shortName, SHORT_NAME_MAX_LENGTH),
                author_name: cutText(input.authorName, AUTHOR_NAME_MAX_LENGTH)
            };

            if (input.authorUrl) {
                body['author_url'] = cutText(
                    input.authorUrl,
                    AUTHOR_URL_MAX_LENGTH
                );
            }

            const result = await call('createAccount', body);
            const accessToken = result['access_token'];

            if (typeof accessToken !== 'string' || !accessToken) {
                throw new TelegraphError(
                    'Telegraph createAccount returned no access token'
                );
            }

            return accessToken;
        },

        async createPage(input) {
            const body: Record<string, unknown> = {
                access_token: input.accessToken,
                title: cutText(input.title, TITLE_MAX_LENGTH),
                author_name: cutText(input.authorName, AUTHOR_NAME_MAX_LENGTH),
                content: JSON.stringify(input.content)
            };

            if (input.authorUrl) {
                body['author_url'] = cutText(
                    input.authorUrl,
                    AUTHOR_URL_MAX_LENGTH
                );
            }

            const result = await call('createPage', body);
            const url = result['url'];

            if (typeof url !== 'string' || !url) {
                throw new TelegraphError(
                    'Telegraph createPage returned no url'
                );
            }

            return { url };
        }
    };
};
