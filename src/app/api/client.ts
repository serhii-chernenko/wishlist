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
import { isAbortError, readJsonBody } from '../logic/response-body';

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
    keepalive?: boolean;
    handleDisabledLocally?: boolean;
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
    isPageClosing?: () => boolean;
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

export const createApiClient = ({
    initData,
    onSystemFailure,
    onConnectivity,
    fetchImpl = (input, init) => fetch(input, init),
    wait = waitFor,
    isPageClosing = () => false
}: ApiClientOptions): ApiClient => {
    const shouldKeepAlive = (options: {
        keepalive?: boolean;
        body?: unknown;
    }) => {
        return (
            options.keepalive === true ||
            (isPageClosing() && !(options.body instanceof Blob))
        );
    };

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
        const body = buildBody(options.body);
        const init = {
            method: route.method,
            headers: buildHeaders(initData, options.body),
            credentials: 'omit',
            cache: 'no-store',
            ...(body !== undefined && { body }),
            ...(options.signal !== undefined && { signal: options.signal }),
            ...(shouldKeepAlive(options) && { keepalive: true })
        } as RequestInit;

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
                        : await readJsonBody(response)
                ) as ApiResponse<Key>;
            }

            const failure: AppFailure =
                response === null
                    ? NETWORK_FAILURE
                    : toApiFailure(
                          response.status,
                          await readJsonBody(response),
                          parseRetryAfterHeader(
                              response.headers.get('Retry-After')
                          )
                      );
            const delay = retries ? getRetryDelayMs(failure, attempt) : null;

            if (delay === null) {
                const screen = toSystemScreen(failure);
                const handledLocally =
                    options.handleDisabledLocally === true &&
                    failure.kind === 'api' &&
                    failure.code === 'disabled';

                if (screen !== null && !handledLocally) {
                    onSystemFailure?.(screen, failure);
                }

                throw new ApiRequestError(failure);
            }

            await wait(delay);
        }
    };

    return { request };
};
