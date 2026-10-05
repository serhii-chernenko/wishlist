import { useEffect, useState } from 'hono/jsx/dom';
import { ArrowUpLeft, GripVertical, X } from 'lucide';

import type { ApiImage, ImageReorderSource } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import { keyboardTargetIndex, moveItem, reorderHashes } from '../logic/reorder';
import type { PhotoFailureKind, PhotoUploadStatus } from '../logic/wish-draft';
import { useLL } from '../state/context';
import { haptics } from '../telegram/haptics';
import { DangerButton } from './danger-button';
import { Icon } from './icon';
import {
    PHOTO_HANDLE_ATTRIBUTE,
    PHOTO_HASH_ATTRIBUTE,
    PHOTO_SLOT_ATTRIBUTE,
    usePhotoDrag
} from './photo-drag';
import { PhotoFrame } from './photo-frame';

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
    reorderDisabled?: boolean;
    onPick: (files: File[]) => void;
    onRemove: (image: ApiImage) => void;
    onRemoveAll: () => void;
    onRetry: (key: number) => void;
    onDiscard: (key: number) => void;
    onChatFallback?: () => void;
    onReorder?: (hashes: string[], source: ImageReorderSource) => void;
}

const INPUT_ID = 'wish-photo-input';
const TITLE_ID = 'wish-photos-title';
const HINT_ID = 'wish-photos-hint';
const REORDER_HINT_ID = 'wish-photos-reorder-hint';
const MINIMUM_SORTABLE_PHOTOS = 2;

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

interface SortableControls {
    enabled: boolean;
    onKeyMove: (event: KeyboardEvent) => void;
    onMakeFirst: () => void;
}

const UploadedTile = ({
    image,
    index,
    label,
    lifted,
    removing,
    sortable,
    onRemove,
    onCountdownChange
}: {
    image: ApiImage;
    index: number;
    label: string;
    lifted: boolean;
    removing: boolean;
    sortable: SortableControls | null;
    onRemove: () => void;
    onCountdownChange: (running: boolean) => void;
}) => {
    const LL = useLL();
    const texts = LL.photos.reorder;
    const tileClass = [
        'photo-tile',
        sortable === null ? '' : 'photo-tile-sortable',
        lifted ? 'photo-tile-lifted' : ''
    ]
        .filter(Boolean)
        .join(' ');
    const slotAttributes = {
        [PHOTO_SLOT_ATTRIBUTE]: String(index),
        [PHOTO_HASH_ATTRIBUTE]: image.hash
    };

    return (
        <li class={tileClass} {...slotAttributes}>
            <div class='photo-tile-body'>
                <PhotoFrame src={image.url} alt={label} />
                <DangerButton
                    compact
                    class='photo-remove'
                    icon={X}
                    label={`${LL.photos.remove()}: ${label}`}
                    disabled={removing}
                    onCommit={onRemove}
                    onCountdownChange={onCountdownChange}
                />
                {sortable === null ? null : (
                    <button
                        type='button'
                        class='photo-handle'
                        aria-label={`${texts.handle()}: ${label}`}
                        aria-describedby={REORDER_HINT_ID}
                        disabled={!sortable.enabled}
                        onKeyDown={sortable.onKeyMove}
                        {...{ [PHOTO_HANDLE_ATTRIBUTE]: '' }}
                    >
                        <Icon icon={GripVertical} />
                    </button>
                )}
                {sortable === null || index === 0 ? null : (
                    <button
                        type='button'
                        class='photo-first'
                        aria-label={`${texts.makeFirst()}: ${label}`}
                        disabled={!sortable.enabled}
                        onClick={sortable.onMakeFirst}
                    >
                        <Icon icon={ArrowUpLeft} />
                    </button>
                )}
            </div>
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
    onChatFallback,
    reorderDisabled = false,
    onReorder
}: PhotoPickerProps) => {
    const LL = useLL();
    const shown = images.length + pending.length;
    const photoLabel = (index: number) => {
        return LL.a11y.photo({ index: index + 1, total: shown, title });
    };
    const sortable =
        onReorder !== undefined && images.length >= MINIMUM_SORTABLE_PHOTOS;
    const [removalCountdowns, setRemovalCountdowns] = useState(0);
    const trackRemovalCountdown = (running: boolean) => {
        setRemovalCountdowns(count => count + (running ? 1 : -1));
    };
    const canReorder = sortable && !reorderDisabled && removalCountdowns === 0;
    const [announcement, setAnnouncement] = useState('');
    const [focusHash, setFocusHash] = useState<string | null>(null);
    const hashes = images.map(image => image.hash);
    const reorder = (from: number, to: number, source: ImageReorderSource) => {
        const moved = images[from];

        if (onReorder === undefined || moved === undefined || from === to) {
            return null;
        }

        onReorder(reorderHashes(images, from, to), source);
        setAnnouncement(
            LL.photos.reorder.moved({ position: to + 1, total: images.length })
        );

        return moved.hash;
    };
    const photoDrag = usePhotoDrag({
        hashes,
        disabled: !canReorder,
        onDrop: (from, to) => {
            reorder(from, to, 'drag');
        }
    });
    const { drag } = photoDrag;
    const displayed =
        drag === null ? images : moveItem(images, drag.from, drag.target);
    const moveFromControl = (
        from: number,
        to: number,
        source: ImageReorderSource
    ) => {
        const moved = reorder(from, to, source);

        if (moved !== null) {
            haptics.selection();
            setFocusHash(moved);
        }
    };
    const controlsFor = (index: number): SortableControls | null => {
        if (!sortable) {
            return null;
        }

        return {
            enabled: canReorder && drag === null,
            onKeyMove: (event: KeyboardEvent) => {
                const target = keyboardTargetIndex(
                    event.key,
                    index,
                    images.length
                );

                if (target !== null) {
                    event.preventDefault();
                    moveFromControl(index, target, 'keyboard');
                }
            },
            onMakeFirst: () => {
                moveFromControl(index, 0, 'button');
            }
        };
    };

    useEffect(() => {
        if (focusHash === null) {
            return;
        }

        photoDrag.gridRef.current
            ?.querySelector<HTMLElement>(
                `[${PHOTO_HASH_ATTRIBUTE}="${focusHash}"] [${PHOTO_HANDLE_ATTRIBUTE}]`
            )
            ?.focus();
        setFocusHash(null);
    }, [focusHash, hashes.join()]);

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
            <ul
                ref={photoDrag.gridRef}
                class={
                    drag === null
                        ? 'photo-grid'
                        : 'photo-grid photo-grid-dragging'
                }
                aria-describedby={HINT_ID}
                {...photoDrag.gridEvents}
            >
                {displayed.map((image, index) => {
                    return (
                        <UploadedTile
                            key={image.hash}
                            image={image}
                            index={index}
                            label={photoLabel(index)}
                            lifted={drag?.hash === image.hash}
                            removing={removing || drag !== null}
                            sortable={controlsFor(index)}
                            onRemove={() => {
                                onRemove(image);
                            }}
                            onCountdownChange={trackRemovalCountdown}
                        />
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
            {sortable ? (
                <p id={REORDER_HINT_ID} class='field-hint photos-reorder-hint'>
                    {LL.photos.reorder.instructions()}
                </p>
            ) : null}
            <p class='sr-only' role='status'>
                {announcement}
            </p>
            {images.length > 1 || onChatFallback !== undefined ? (
                <div class='photos-actions'>
                    {images.length > 1 ? (
                        <DangerButton
                            class='photos-remove-all'
                            label={LL.photos.removeAll()}
                            disabled={removing}
                            onCommit={onRemoveAll}
                            onCountdownChange={trackRemovalCountdown}
                        />
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
