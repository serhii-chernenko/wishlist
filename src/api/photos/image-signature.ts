import type { AppUploadContentType } from '../../shared/app-api';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;
const WEBP_FORMAT_OFFSET = 8;
const GIF_SIGNATURES = [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
] as const;
const FTYP_BOX_TYPE = [0x66, 0x74, 0x79, 0x70] as const;
const FTYP_BOX_TYPE_OFFSET = 4;
const FTYP_MAJOR_BRAND_OFFSET = 8;
const FTYP_COMPATIBLE_BRANDS_OFFSET = 16;
const FTYP_BRAND_LENGTH = 4;
const AVIF_BRANDS = [
    [0x61, 0x76, 0x69, 0x66],
    [0x61, 0x76, 0x69, 0x73]
] as const;

export const SNIFFED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif'
] as const;

export type SniffedImageType = (typeof SNIFFED_IMAGE_TYPES)[number];

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

const readUint32 = (bytes: Uint8Array, offset: number) => {
    return new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength
    ).getUint32(offset);
};

const isAvifBrandAt = (bytes: Uint8Array, offset: number) => {
    return AVIF_BRANDS.some(brand => {
        return hasBytesAt(bytes, brand, offset);
    });
};

const isAvif = (bytes: Uint8Array) => {
    if (
        bytes.byteLength < FTYP_COMPATIBLE_BRANDS_OFFSET ||
        !hasBytesAt(bytes, FTYP_BOX_TYPE, FTYP_BOX_TYPE_OFFSET)
    ) {
        return false;
    }

    if (isAvifBrandAt(bytes, FTYP_MAJOR_BRAND_OFFSET)) {
        return true;
    }

    const boxEnd = Math.min(readUint32(bytes, 0), bytes.byteLength);

    for (
        let offset = FTYP_COMPATIBLE_BRANDS_OFFSET;
        offset + FTYP_BRAND_LENGTH <= boxEnd;
        offset += FTYP_BRAND_LENGTH
    ) {
        if (isAvifBrandAt(bytes, offset)) {
            return true;
        }
    }

    return false;
};

const isGif = (bytes: Uint8Array) => {
    return GIF_SIGNATURES.some(signature => {
        return hasBytesAt(bytes, signature, 0);
    });
};

/** Detects the image format from magic bytes alone; the declared content type is never trusted. */
export const sniffImageType = (bytes: ArrayBuffer): SniffedImageType | null => {
    const view = new Uint8Array(bytes);
    const passthroughType = (
        Object.keys(SIGNATURE_MATCHERS) as AppUploadContentType[]
    ).find(contentType => {
        return SIGNATURE_MATCHERS[contentType](view);
    });

    if (passthroughType !== undefined) {
        return passthroughType;
    }

    if (isGif(view)) {
        return 'image/gif';
    }

    return isAvif(view) ? 'image/avif' : null;
};

export const matchesDeclaredImageType = (
    bytes: ArrayBuffer,
    contentType: AppUploadContentType
) => {
    return SIGNATURE_MATCHERS[contentType](new Uint8Array(bytes));
};
