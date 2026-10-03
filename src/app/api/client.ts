import {
    APP_API_ROUTES,
    APP_AUTH_SCHEME,
    buildAppApiPath,
    type AppApiEndpoints,
    type AppApiPathParams,
    type AppApiRouteKey
} from '../../shared/app-api';
import {
    getRetryDelayMs,
    NETWORK_FAILURE,
    parseRetryAfterHeader,
    toApiFailure,
    toSystemScreen,
    type AppFailure,
    type SystemScreenId
} from '../logic/errors';

const NO_CONTENT_STATUS = 204;
const JSON_CONTENT_TYPE = 'application/json';

type QueryValues = Readonly<Record<string, string | number | undefined>>;

export type ApiResponse<Key extends AppApiRouteKey> =
    AppApiEndpoints[Key]['response'];

export type ApiRequestOptions<Key extends AppApiRouteKey> = {
    params?: AppApiPathParams<Key>;
    query?: AppApiEndpoints[Key]['query'];
    body?: AppApiEndpoints[Key]['body'];
    signal?: AbortSignal;
};

export class ApiRequestError extends Error {
    readonly failure: AppFailure;

    constructor(failure: AppFailure) {
        super(failure.kind === 'api' ? failure.code : failure.kind);
        this.name = 'ApiRequestError';
        this.failure = failure;
    }
}

export interface ApiClientOptions {
    initData: string;
    onSystemFailure?: (screen: SystemScreenId, failure: AppFailure) => void;
    onConnectivity?: (online: boolean) => void;
    fetchImpl?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
}

export interface ApiClient {
    request<Key extends AppApiRouteKey>(
        key: Key,
        options?: ApiRequestOptions<Key>
    ): Promise<ApiResponse<Key>>;
}

const waitFor = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

const isAbortError = (error: unknown) => {
    return error instanceof DOMException && error.name === 'AbortError';
};

const buildBody = (body: unknown): BodyInit | undefined => {
    if (body === undefined || body === null) {
        return undefined;
    }

    return body instanceof Blob ? body : JSON.stringify(body);
};

const buildHeaders = (initData: string, body: unknown) => {
    const headers = new Headers({
        Authorization: `${APP_AUTH_SCHEME} ${initData}`,
        Accept: JSON_CONTENT_TYPE
    });

    if (body instanceof Blob) {
        headers.set('Content-Type', body.type);
    } else if (body !== undefined && body !== null) {
        headers.set('Content-Type', JSON_CONTENT_TYPE);
    }

    return headers;
};

const readJson = async (response: Response): Promise<unknown> => {
    try {
        return await response.json();
    } catch {
        return null;
    }
};

export const createApiClient = ({
    initData,
    onSystemFailure,
    onConnectivity,
    fetchImpl = (input, init) => fetch(input, init),
    wait = waitFor
}: ApiClientOptions): ApiClient => {
    const send = async <Key extends AppApiRouteKey>(
        key: Key,
        options: ApiRequestOptions<Key>
    ) => {
        const route = APP_API_ROUTES[key];
        const path = buildAppApiPath(
            key,
            options.params ?? ({} as AppApiPathParams<Key>),
            (options.query ?? {}) as QueryValues
        );
        const init: RequestInit = {
            method: route.method,
            headers: buildHeaders(initData, options.body),
            credentials: 'omit',
            cache: 'no-store'
        };
        const body = buildBody(options.body);

        if (body !== undefined) {
            init.body = body;
        }

        if (options.signal !== undefined) {
            init.signal = options.signal;
        }

        try {
            return await fetchImpl(path, init);
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }

            return null;
        }
    };

    const request = async <Key extends AppApiRouteKey>(
        key: Key,
        options: ApiRequestOptions<Key> = {}
    ): Promise<ApiResponse<Key>> => {
        const retries = APP_API_ROUTES[key].method === 'GET';

        for (let attempt = 0; ; attempt += 1) {
            const response = await send(key, options);

            onConnectivity?.(response !== null);

            if (response?.ok) {
                return (
                    response.status === NO_CONTENT_STATUS
                        ? null
                        : await readJson(response)
                ) as ApiResponse<Key>;
            }

            const failure: AppFailure =
                response === null
                    ? NETWORK_FAILURE
                    : toApiFailure(
                          response.status,
                          await readJson(response),
                          parseRetryAfterHeader(
                              response.headers.get('Retry-After')
                          )
                      );
            const delay = retries ? getRetryDelayMs(failure, attempt) : null;

            if (delay === null) {
                const screen = toSystemScreen(failure);

                if (screen !== null) {
                    onSystemFailure?.(screen, failure);
                }

                throw new ApiRequestError(failure);
            }

            await wait(delay);
        }
    };

    return { request };
};
