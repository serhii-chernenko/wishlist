export const D1_BOUND_PARAMETER_CEILING = 100;

export const DELETE_CHUNK_SIZE = D1_BOUND_PARAMETER_CEILING - 10;

export const chunk = <T>(items: readonly T[], size: number) => {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
};
