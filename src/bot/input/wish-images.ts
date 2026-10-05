export const parseWishImages = (json: string): string[] => {
    try {
        const parsed: unknown = JSON.parse(json);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item): item is string => {
            return typeof item === 'string' && item.length > 0;
        });
    } catch {
        return [];
    }
};
