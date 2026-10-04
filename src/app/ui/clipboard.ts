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
