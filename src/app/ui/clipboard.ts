export const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);

        return true;
    } catch {
        const area = document.createElement('textarea');

        area.value = text;
        area.className = 'sr-only';
        area.setAttribute('readonly', '');
        document.body.append(area);
        area.select();

        const copied = document.execCommand('copy');

        area.remove();

        return copied;
    }
};

export const canReadClipboard = () => {
    return (
        typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.readText === 'function'
    );
};

export const readClipboardText = async () => {
    try {
        return await navigator.clipboard.readText();
    } catch {
        return null;
    }
};
