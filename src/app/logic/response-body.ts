export const isAbortError = (error: unknown) => {
    return error instanceof DOMException && error.name === 'AbortError';
};

/** Parses a JSON body, reading a broken body as null but rethrowing an abort so a cancelled load never resolves with empty data. */
export const readJsonBody = async (response: {
    json(): Promise<unknown>;
}): Promise<unknown> => {
    try {
        return await response.json();
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return null;
    }
};
