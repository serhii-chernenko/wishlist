import {
    APP_UPLOAD_JPEG_QUALITY,
    APP_UPLOAD_LONGEST_EDGE_PX
} from '../../shared/app-api';

const OUTPUT_TYPE = 'image/jpeg';

export class ImageDecodeError extends Error {
    constructor() {
        super('image could not be decoded');
        this.name = 'ImageDecodeError';
    }
}

export interface ResizedImage {
    blob: Blob;
    width: number;
    height: number;
}

const loadImage = (source: Blob) => {
    const url = URL.createObjectURL(source);

    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();

        image.decoding = 'async';
        image.onload = () => {
            resolve(image);
        };
        image.onerror = () => {
            reject(new ImageDecodeError());
        };
        image.src = url;
    }).finally(() => {
        URL.revokeObjectURL(url);
    });
};

export const fitWithin = (
    width: number,
    height: number,
    longestEdge: number
) => {
    const scale = Math.min(1, longestEdge / Math.max(width, height, 1));

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
};

const encodeCanvas = (canvas: HTMLCanvasElement) => {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (blob === null) {
                    reject(new ImageDecodeError());
                } else {
                    resolve(blob);
                }
            },
            OUTPUT_TYPE,
            APP_UPLOAD_JPEG_QUALITY
        );
    });
};

/** Re-encodes every picked photo as JPEG, which also strips EXIF metadata such as location. */
export const resizeImage = async (
    source: Blob,
    longestEdge = APP_UPLOAD_LONGEST_EDGE_PX
): Promise<ResizedImage> => {
    const image = await loadImage(source);
    const size = fitWithin(
        image.naturalWidth,
        image.naturalHeight,
        longestEdge
    );
    const canvas = document.createElement('canvas');

    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d');

    if (context === null) {
        throw new ImageDecodeError();
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);

    return { blob: await encodeCanvas(canvas), ...size };
};
