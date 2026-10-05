import type { ImportStart } from '../logic/link-import';

let pendingImport: { link: string; start: ImportStart } | null = null;
const linkStepTexts = new Map<number, string>();

/** Keeps the import answer (with its short-lived import token) in memory only; the editor route carries just the link, so a reload reopens the editor with the link alone. */
export const handOffImport = (link: string, start: ImportStart) => {
    pendingImport = { link, start };
};

export const findHandedOffImport = (link: string): ImportStart | null => {
    return pendingImport?.link === link ? pendingImport.start : null;
};

export const rememberLinkStepText = (entryKey: number, text: string) => {
    linkStepTexts.set(entryKey, text);
};

export const readLinkStepText = (entryKey: number): string => {
    return linkStepTexts.get(entryKey) ?? '';
};
