import type { AppUploadContentType } from '../../shared/app-api';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;
const WEBP_FORMAT_OFFSET = 8;

const hasBytesAt = (
    bytes: Uint8Array,
    expected: readonly number[],
    offset: number
) => {
    return expected.every((value, index) => {
        return bytes[offset + index] === value;
    });
};

const SIGNATURE_MATCHERS: Record<
    AppUploadContentType,
    (bytes: Uint8Array) => boolean
> = {
    'image/jpeg': bytes => {
        return hasBytesAt(bytes, JPEG_SIGNATURE, 0);
    },
    'image/png': bytes => {
        return hasBytesAt(bytes, PNG_SIGNATURE, 0);
    },
    'image/webp': bytes => {
        return (
            hasBytesAt(bytes, RIFF_SIGNATURE, 0) &&
            hasBytesAt(bytes, WEBP_SIGNATURE, WEBP_FORMAT_OFFSET)
        );
    }
};

export const matchesDeclaredImageType = (
    bytes: ArrayBuffer,
    contentType: AppUploadContentType
) => {
    return SIGNATURE_MATCHERS[contentType](new Uint8Array(bytes));
};
