export interface PhotoSizeLike {
    file_id: string;
    width: number;
    height: number;
}

export const pickLargestPhoto = (photos: readonly PhotoSizeLike[]) => {
    let largest: PhotoSizeLike | undefined;

    for (const photo of photos) {
        if (
            largest === undefined ||
            photo.width * photo.height >= largest.width * largest.height
        ) {
            largest = photo;
        }
    }

    return largest ?? null;
};
