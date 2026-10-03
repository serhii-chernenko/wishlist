import type { ApiImage } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import type { PhotoFailureKind, PhotoUploadStatus } from '../logic/wish-draft';
import { useLL } from '../state/context';

export interface PendingPhotoTile {
    key: number;
    previewUrl: string;
    status: PhotoUploadStatus;
    failure: PhotoFailureKind | null;
}

export interface UploadProgress {
    done: number;
    total: number;
}

export interface PhotoPickerProps {
    title: string;
    images: readonly ApiImage[];
    pending: readonly PendingPhotoTile[];
    max: number;
    waitingForSave: boolean;
    progress: UploadProgress | null;
    removing: boolean;
    onPick: (files: File[]) => void;
    onRemove: (index: number, image: ApiImage) => void;
    onRemoveAll: () => void;
    onRetry: (key: number) => void;
    onDiscard: (key: number) => void;
    onChatFallback?: () => void;
}

const INPUT_ID = 'wish-photo-input';
const TITLE_ID = 'wish-photos-title';
const HINT_ID = 'wish-photos-hint';

export const photoFailureText = (
    LL: AppTranslator,
    failure: PhotoFailureKind | null,
    max: number
) => {
    switch (failure) {
        case 'full':
            return LL.photos.full({ max });
        case 'tooLarge':
            return LL.photos.tooLarge();
        case 'unsupported':
            return LL.photos.unsupported();
        case 'writeAccess':
            return LL.errors.writeAccessRequired();
        default:
            return LL.photos.failed();
    }
};

const PendingTile = ({
    tile,
    label,
    max,
    onRetry,
    onDiscard
}: {
    tile: PendingPhotoTile;
    label: string;
    max: number;
    onRetry: () => void;
    onDiscard: () => void;
}) => {
    const LL = useLL();
    const failed = tile.status === 'failed';

    return (
        <li class={`photo-tile photo-tile-${tile.status}`}>
            <img src={tile.previewUrl} alt={label} decoding='async' />
            {tile.status === 'uploading' ? (
                <span class='photo-state'>
                    <span
                        class='loading loading-spinner loading-md'
                        aria-hidden='true'
                    />
                    <span class='sr-only'>{LL.photos.uploading()}</span>
                </span>
            ) : null}
            {failed ? (
                <span class='photo-state photo-state-failed'>
                    <button
                        type='button'
                        class='photo-retry'
                        aria-label={`${LL.common.retry()}: ${photoFailureText(LL, tile.failure, max)}`}
                        onClick={onRetry}
                    >
                        <span aria-hidden='true'>↻</span>
                    </button>
                </span>
            ) : null}
            {tile.status === 'uploading' ? null : (
                <button
                    type='button'
                    class='photo-remove'
                    aria-label={`${LL.photos.remove()}: ${label}`}
                    onClick={onDiscard}
                >
                    <span aria-hidden='true'>×</span>
                </button>
            )}
        </li>
    );
};

/** The editor's photo grid: uploaded photos, local tiles with their upload state, the add tile and the chat fallback. */
export const PhotoPicker = ({
    title,
    images,
    pending,
    max,
    waitingForSave,
    progress,
    removing,
    onPick,
    onRemove,
    onRemoveAll,
    onRetry,
    onDiscard,
    onChatFallback
}: PhotoPickerProps) => {
    const LL = useLL();
    const shown = images.length + pending.length;
    const photoLabel = (index: number) => {
        return LL.a11y.photo({ index: index + 1, total: shown, title });
    };

    return (
        <section class='photos' aria-labelledby={TITLE_ID}>
            <div class='photos-head'>
                <h2 id={TITLE_ID} class='section-title'>
                    {LL.photos.title()}
                </h2>
                <p class='photos-count'>
                    {LL.photos.count({ count: shown, max })}
                </p>
            </div>
            <p id={HINT_ID} class='field-hint'>
                {waitingForSave && pending.length > 0
                    ? LL.photos.queued()
                    : LL.photos.hint({ max })}
            </p>
            <ul class='photo-grid' aria-describedby={HINT_ID}>
                {images.map((image, index) => {
                    return (
                        <li key={image.hash} class='photo-tile'>
                            <img
                                src={image.url}
                                alt={photoLabel(index)}
                                loading='lazy'
                                decoding='async'
                            />
                            <button
                                type='button'
                                class='photo-remove'
                                aria-label={`${LL.photos.remove()}: ${photoLabel(index)}`}
                                disabled={removing}
                                onClick={() => {
                                    onRemove(index, image);
                                }}
                            >
                                <span aria-hidden='true'>×</span>
                            </button>
                        </li>
                    );
                })}
                {pending.map((tile, index) => {
                    return (
                        <PendingTile
                            key={`pending-${tile.key}`}
                            tile={tile}
                            label={photoLabel(images.length + index)}
                            max={max}
                            onRetry={() => {
                                onRetry(tile.key);
                            }}
                            onDiscard={() => {
                                onDiscard(tile.key);
                            }}
                        />
                    );
                })}
                {shown < max ? (
                    <li key='add' class='photo-tile photo-add'>
                        <label for={INPUT_ID} class='photo-add-label'>
                            <span class='photo-add-plus' aria-hidden='true' />
                            <span>{LL.photos.add()}</span>
                        </label>
                        <input
                            id={INPUT_ID}
                            class='sr-only'
                            type='file'
                            accept='image/*'
                            multiple
                            onChange={(event: Event) => {
                                const input =
                                    event.currentTarget as HTMLInputElement;
                                const files = Array.from(input.files ?? []);

                                input.value = '';

                                if (files.length > 0) {
                                    onPick(files);
                                }
                            }}
                        />
                    </li>
                ) : null}
            </ul>
            <p class='sr-only' role='status'>
                {progress === null
                    ? ''
                    : `${LL.photos.uploading()} ${LL.photos.progress(progress)}`}
            </p>
            {images.length > 1 || onChatFallback !== undefined ? (
                <div class='photos-actions'>
                    {images.length > 1 ? (
                        <button
                            type='button'
                            class='text-button'
                            disabled={removing}
                            onClick={onRemoveAll}
                        >
                            {LL.photos.removeAll()}
                        </button>
                    ) : null}
                    {onChatFallback === undefined ? null : (
                        <div class='photos-fallback'>
                            <button
                                type='button'
                                class='text-button'
                                aria-describedby='wish-photos-fallback-hint'
                                onClick={onChatFallback}
                            >
                                {LL.photos.chatFallback.action()}
                            </button>
                            <p
                                id='wish-photos-fallback-hint'
                                class='field-hint'
                            >
                                {LL.photos.chatFallback.hint()}
                            </p>
                        </div>
                    )}
                </div>
            ) : null}
        </section>
    );
};
