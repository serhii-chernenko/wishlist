export const isRemoveCommand = (
    text: string | undefined,
    removeLabels: readonly string[]
) => {
    if (text === undefined) {
        return false;
    }

    const normalized = text.trim();

    return removeLabels.some(label => {
        return label.trim() === normalized;
    });
};
