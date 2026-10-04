import { useEffect, useState } from 'hono/jsx/dom';

import type {
    ApiImage,
    FieldErrorCode,
    OwnWishDto
} from '../../shared/app-api';
import { getCurrencySymbol } from '../../shared/money';
import type { AppTranslator } from '../i18n/i18n';
import { fieldErrorMessage } from '../i18n/messages';
import { getFieldErrors, hasErrorCode } from '../logic/errors';
import {
    formatIsoDate,
    getApproximateDraftPrice,
    getLinkHost
} from '../logic/format';
import { runOptimistic } from '../logic/optimistic';
import {
    checkDraftForSubmit,
    countFreePhotoSlots,
    DRAFT_TEXT_FIELDS,
    createPhotoQueue,
    draftFromWish,
    createEmptyDraft,
    isHighPriority,
    toToggledPriority,
    enqueuePhotos,
    failQueuedPhotos,
    isDraftDirty,
    nextQueuedPhoto,
    removePendingPhoto,
    setPhotoStatus,
    summarizePhotoQueue,
    toCreateInput,
    toDraftErrors,
    toPatchInput,
    toPhotoFailureKind,
    validateDraft,
    visibleDraftErrors,
    withFlags,
    type DraftErrors,
    type DraftFlag,
    type DraftTextField,
    type PhotoFailureKind,
    type PhotoQueue,
    type WishDraft
} from '../logic/wish-draft';
import { ImageDecodeError, resizeImage } from '../media/resize';
import { useDirtyGuard, useEditorMode } from '../nav/guards';
import type { ScreenProps } from '../nav/routes';
import {
    useApp,
    useAppResource,
    useEntryKey,
    useLL,
    useSession,
    type AppServices
} from '../state/context';
import { toFailure, useLatest } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { openTelegramLink, requestWriteAccess } from '../telegram/links';
import { confirmAction, showPopup } from '../telegram/popups';
import { Field } from '../ui/field';
import {
    PhotoPicker,
    photoFailureText,
    type UploadProgress
} from '../ui/photo-picker';
import { ScreenLayout } from '../ui/screen';
import { TagSkeletons } from '../ui/skeleton';
import { Tag } from '../ui/tag';
import { Toggle } from '../ui/toggle';
import { ErrorState } from '../ui/error-state';
import {
    forgetWish,
    readCachedWish,
    storeWish,
    updateCounts,
    useWishFlagToggle,
    WISHES_LIST_KEY,
    wishItemKey
} from './wishes';

const FIELD_ID_PREFIX = 'wish-';
const REMOVE_DONE = 'done';
const REMOVE_NOT_DONE = 'notDone';

interface UploadSource {
    file: Blob;
    previewUrl: string;
}

type UploadOutcome =
    | { kind: 'done'; wish: OwnWishDto; added: boolean }
    | { kind: 'failed'; failure: PhotoFailureKind };

const fieldId = (field: DraftTextField) => {
    return `${FIELD_ID_PREFIX}${field}`;
};

const revealField = (field: DraftTextField) => {
    const element = document.getElementById(fieldId(field));

    if (element !== null) {
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'center' });
    }
};

const draftErrorText = (
    LL: AppTranslator,
    field: DraftTextField,
    code: FieldErrorCode,
    limits: { title: number; description: number; link: number }
) => {
    const errors = LL.editor.errors;

    if (field === 'title') {
        if (code === 'empty' || code === 'required') {
            return errors.titleEmpty();
        }

        if (code === 'tooLong') {
            return errors.titleTooLong({ max: limits.title });
        }

        if (code === 'containsLink') {
            return errors.titleContainsLink();
        }
    }

    if (field === 'description' && code === 'tooLong') {
        return errors.descriptionTooLong({ max: limits.description });
    }

    if (field === 'price' && code === 'invalid') {
        return errors.priceInvalid();
    }

    if (field === 'link' && code === 'invalid') {
        return errors.linkInvalid();
    }

    return fieldErrorMessage(
        LL,
        code,
        field === 'link' ? limits.link : limits.description
    );
};

const askForWriteAccess = async (LL: AppTranslator) => {
    const texts = LL.photos.writeAccess;
    const confirmed = await confirmAction({
        title: texts.title(),
        message: texts.text(),
        confirmText: texts.allow(),
        cancelText: LL.common.cancel()
    });

    return confirmed && (await requestWriteAccess());
};

const uploadPhoto = async (
    services: AppServices,
    wish: OwnWishDto,
    source: UploadSource
): Promise<UploadOutcome> => {
    try {
        const resized = await resizeImage(source.file);
        const updated = await services.api.request('uploadWishImage', {
            params: { id: wish.id },
            body: resized.blob
        });

        return {
            kind: 'done',
            wish: updated,
            added: updated.images.length > wish.images.length
        };
    } catch (error) {
        if (error instanceof ImageDecodeError) {
            return { kind: 'failed', failure: 'unsupported' };
        }

        const failure = toFailure(error);

        return {
            kind: 'failed',
            failure: toPhotoFailureKind(
                failure.kind === 'api' ? failure.code : null
            )
        };
    }
};

/** Sequential photo uploads with per-tile state; in create mode photos wait in the queue until the wish exists. */
const usePhotoUploads = (wish: OwnWishDto | null) => {
    const services = useApp();
    const LL = useLL();
    const { config } = useSession();
    const max = config.limits.images;
    const [state] = useState(() => {
        return {
            queue: createPhotoQueue<UploadSource>(),
            pumping: false,
            alive: true,
            done: 0,
            batch: 0
        };
    });
    const [queue, setQueue] = useState(state.queue);
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const latestWish = useLatest(wish);

    const update = (
        change: (current: PhotoQueue<UploadSource>) => PhotoQueue<UploadSource>
    ) => {
        state.queue = change(state.queue);
        setQueue(state.queue);
    };

    useEffect(() => {
        return () => {
            state.alive = false;

            for (const item of state.queue.items) {
                URL.revokeObjectURL(item.source.previewUrl);
            }
        };
    }, []);

    const reportFailure = (failure: PhotoFailureKind) => {
        haptics.error();
        services.toast.show(photoFailureText(LL, failure, max), 'error');
    };

    const pump = async (target: OwnWishDto | null = latestWish.current) => {
        if (state.pumping || target === null) {
            return;
        }

        state.pumping = true;
        state.done = 0;
        state.batch = summarizePhotoQueue(state.queue).active;

        let current = target;
        let added = 0;
        let askedForAccess = false;

        try {
            for (;;) {
                const next = nextQueuedPhoto(state.queue);

                if (next === null || !state.alive) {
                    break;
                }

                setProgress({ done: state.done, total: state.batch });
                update(pending => {
                    return setPhotoStatus(pending, next.key, 'uploading');
                });

                const outcome = await uploadPhoto(
                    services,
                    latestWish.current ?? current,
                    next.source
                );

                if (outcome.kind === 'done') {
                    current = outcome.wish;
                    storeWish(services.cache, outcome.wish);
                    URL.revokeObjectURL(next.source.previewUrl);
                    update(pending => removePendingPhoto(pending, next.key));
                    state.done += 1;
                    added += outcome.added ? 1 : 0;

                    if (!outcome.added) {
                        services.toast.show(LL.photos.duplicate());
                    }

                    continue;
                }

                const { failure } = outcome;

                if (failure === 'writeAccess' && !askedForAccess) {
                    askedForAccess = true;

                    if (await askForWriteAccess(LL)) {
                        update(pending => {
                            return setPhotoStatus(pending, next.key, 'queued');
                        });

                        continue;
                    }
                }

                update(pending => {
                    const failed = setPhotoStatus(
                        pending,
                        next.key,
                        'failed',
                        failure
                    );

                    return failure === 'full'
                        ? failQueuedPhotos(failed, 'full')
                        : failed;
                });
                reportFailure(failure);
                services.reportEvent('uploadFailed', 'wishEditor');
            }
        } finally {
            state.pumping = false;
            setProgress(null);
        }

        if (added > 0) {
            haptics.success();
            services.toast.show(LL.photos.uploaded(), 'success');
        }

        return summarizePhotoQueue(state.queue);
    };

    const pick = (files: File[]) => {
        const free = countFreePhotoSlots(
            latestWish.current?.images.length ?? 0,
            state.queue,
            max
        );
        const sources = files.slice(0, free).map(file => {
            return { file, previewUrl: URL.createObjectURL(file) };
        });
        const result = enqueuePhotos(state.queue, sources, free);

        update(() => result.queue);

        if (files.length > sources.length) {
            reportFailure('full');
        }

        if (latestWish.current !== null) {
            void pump();
        }
    };

    const retry = (key: number) => {
        update(pending => setPhotoStatus(pending, key, 'queued'));
        void pump();
    };

    const discard = (key: number) => {
        const item = state.queue.items.find(candidate => {
            return candidate.key === key;
        });

        if (item !== undefined) {
            URL.revokeObjectURL(item.source.previewUrl);
        }

        update(pending => removePendingPhoto(pending, key));
    };

    return {
        queue,
        progress,
        pick,
        retry,
        discard,
        start: pump,
        summary: summarizePhotoQueue(queue)
    };
};

interface WishFormProps {
    wish: OwnWishDto | null;
    onCreated: (wish: OwnWishDto) => void;
    onReload: () => void;
}

const WishForm = ({ wish, onCreated, onReload }: WishFormProps) => {
    const services = useApp();
    const { api, cache, nav, toast } = services;
    const LL = useLL();
    const { me, config, locale } = useSession();
    const entryKey = useEntryKey();
    const toggleFlag = useWishFlagToggle();
    const limits = config.limits;
    const [baseline, setBaseline] = useState<WishDraft>(() => {
        return wish === null
            ? createEmptyDraft(me.currency)
            : draftFromWish(wish);
    });
    const [draft, setDraft] = useState<WishDraft>(baseline);
    const [touched, setTouched] = useState<ReadonlySet<DraftTextField>>(
        () => new Set()
    );
    const [serverErrors, setServerErrors] = useState<DraftErrors>({});
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [removingPhoto, setRemovingPhoto] = useState(false);
    const photos = usePhotoUploads(wish);
    const current = useLatest({ baseline, draft });

    useEffect(() => {
        if (wish === null) {
            return;
        }

        const next = draftFromWish(wish);
        const edited =
            isDraftDirty(current.current.baseline, current.current.draft) &&
            isDraftDirty(next, current.current.draft);

        if (edited) {
            setBaseline(previous => withFlags(previous, next));
            setDraft(previous => withFlags(previous, next));
        } else {
            setBaseline(next);
            setDraft(next);
        }
    }, [wish]);

    const mode = wish === null ? 'create' : 'edit';
    const dirty = isDraftDirty(baseline, draft);
    const clientErrors = validateDraft(draft);
    const shownErrors: DraftErrors = {
        ...visibleDraftErrors(clientErrors, touched),
        ...serverErrors
    };
    const uploadsPending = photos.summary.active > 0;

    useDirtyGuard(dirty || (mode === 'edit' && uploadsPending));
    useEditorMode();

    const leave = () => {
        nav.setDirty(entryKey, false);
        void nav.back();
    };

    const setText = (field: DraftTextField) => {
        return (value: string) => {
            setDraft(previous => ({ ...previous, [field]: value }));
            setServerErrors(previous => {
                if (previous[field] === undefined) {
                    return previous;
                }

                const next = { ...previous };

                delete next[field];

                return next;
            });
        };
    };

    const touch = (field: DraftTextField) => {
        return () => {
            setTouched(previous => {
                return previous.has(field)
                    ? previous
                    : new Set([...previous, field]);
            });
        };
    };

    const setFlag = (flag: DraftFlag, value: boolean) => {
        if (wish === null) {
            setDraft(previous => {
                return flag === 'priority'
                    ? { ...previous, priority: toToggledPriority(value) }
                    : { ...previous, hidden: value };
            });

            return;
        }

        toggleFlag(wish, flag, value);
    };

    const showServerErrors = (errors: DraftErrors) => {
        setServerErrors(errors);

        const [first] = DRAFT_TEXT_FIELDS.filter(field => {
            return errors[field] !== undefined;
        });

        if (first !== undefined) {
            revealField(first);
        }
    };

    const rejectSubmit = (
        check: Extract<ReturnType<typeof checkDraftForSubmit>, { ok: false }>
    ) => {
        setTouched(new Set(DRAFT_TEXT_FIELDS));
        haptics.error();
        services.reportEvent('validationFailed', 'wishEditor', {
            field: check.firstInvalid,
            ...(check.errors[check.firstInvalid] !== undefined && {
                code: check.errors[check.firstInvalid]
            })
        });
        toast.show(
            check.onlyTitleMissing
                ? LL.editor.titleMissing()
                : LL.editor.fixFields({
                      count: Object.keys(check.errors).length
                  }),
            'error'
        );
        revealField(check.firstInvalid);
    };

    const handleFailure = (error: unknown) => {
        const failure = toFailure(error);
        const fields = toDraftErrors(getFieldErrors(failure));

        toast.failure(failure);

        if (Object.keys(fields).length > 0) {
            showServerErrors(fields);

            return;
        }

        if (wish !== null && hasErrorCode(failure, 'notFound')) {
            forgetWish(services, wish.id);
            leave();
        }
    };

    const finishCreate = async (created: OwnWishDto) => {
        const summary = await photos.start(created);

        if (
            summary !== undefined &&
            summary.failed === 0 &&
            !isDraftDirty(current.current.baseline, current.current.draft)
        ) {
            leave();
        }
    };

    const save = async () => {
        if (saving) {
            return;
        }

        const check = checkDraftForSubmit(draft, serverErrors);

        if (!check.ok) {
            rejectSubmit(check);

            return;
        }

        if (!dirty) {
            return;
        }

        setSaving(true);

        try {
            if (wish === null) {
                const created = await api.request('createWish', {
                    body: toCreateInput(draft)
                });
                const saved = draftFromWish(created);

                haptics.success();
                setBaseline(saved);
                setDraft(saved);
                setTouched(new Set());
                cache.invalidate(WISHES_LIST_KEY);
                updateCounts(services, counts => {
                    return { ...counts, wishes: counts.wishes + 1 };
                });
                onCreated(created);
                toast.show(LL.editor.created(), 'success');

                if (photos.summary.active === 0) {
                    leave();
                } else {
                    void finishCreate(created);
                }

                return;
            }

            const updated = await api.request('updateWish', {
                params: { id: wish.id },
                body: toPatchInput(baseline, draft)
            });
            const saved = draftFromWish(updated);

            haptics.success();
            storeWish(cache, updated);
            setBaseline(saved);
            setDraft(saved);
            setTouched(new Set());
            toast.show(LL.editor.saved(), 'success');

            if (!uploadsPending) {
                leave();
            }
        } catch (error) {
            handleFailure(error);
        } finally {
            setSaving(false);
        }
    };

    useBottomButton({
        text: mode === 'create' ? LL.editor.create() : LL.editor.save(),
        onClick: () => {
            void save();
        },
        disabled: mode === 'edit' && !dirty,
        progress: saving
    });

    const removeWish = async () => {
        if (wish === null || removing) {
            return;
        }

        const texts = LL.editor.remove;
        const choice = await showPopup({
            title: texts.title(),
            message: texts.text(),
            actions: [
                { id: REMOVE_DONE, text: texts.done() },
                {
                    id: REMOVE_NOT_DONE,
                    text: texts.notDone(),
                    kind: 'destructive'
                },
                { id: 'cancel', text: LL.common.cancel(), kind: 'cancel' }
            ]
        });

        if (choice === null) {
            return;
        }

        setRemoving(true);

        try {
            await api.request('removeWish', {
                params: { id: wish.id },
                body: { done: choice === REMOVE_DONE }
            });
            haptics.success();
            forgetWish(services, wish.id);
            toast.show(texts.success(), 'success');
            leave();
        } catch (error) {
            setRemoving(false);
            handleFailure(error);
        }
    };

    const removePhoto = (index: number, image: ApiImage) => {
        if (wish === null) {
            return;
        }

        const previous = wish.images;
        const latest = () => readCachedWish(cache, wish.id) ?? wish;

        haptics.selection();
        setRemovingPhoto(true);
        void runOptimistic({
            apply() {
                storeWish(cache, {
                    ...latest(),
                    images: previous.filter(item => item.hash !== image.hash)
                });
            },
            commit() {
                return api.request('removeWishImage', {
                    params: { id: wish.id, index },
                    query: { hash: image.hash }
                });
            },
            rollback() {
                storeWish(cache, { ...latest(), images: previous });
            },
            settle(updated) {
                storeWish(cache, updated);
                toast.show(LL.photos.removed(), 'success');
            },
            fail(error) {
                const failure = toFailure(error);

                toast.failure(failure);

                if (hasErrorCode(failure, 'imageChanged', 'notFound')) {
                    onReload();
                }
            }
        }).finally(() => {
            setRemovingPhoto(false);
        });
    };

    const removeAllPhotos = async () => {
        if (wish === null) {
            return;
        }

        const texts = LL.photos.removeAllConfirm;
        const confirmed = await confirmAction({
            title: texts.title(),
            message: texts.text(),
            confirmText: texts.confirm(),
            cancelText: LL.common.cancel(),
            destructive: true
        });

        if (!confirmed) {
            return;
        }

        setRemovingPhoto(true);

        try {
            storeWish(
                cache,
                await api.request('clearWishImages', {
                    params: { id: wish.id }
                })
            );
            haptics.success();
            toast.show(LL.toasts.removed(), 'success');
        } catch (error) {
            toast.failure(toFailure(error));
        } finally {
            setRemovingPhoto(false);
        }
    };

    const addPhotosInChat = async () => {
        if (wish === null) {
            return;
        }

        try {
            await api.request('startImageChatIntent', {
                params: { id: wish.id }
            });
            toast.show(LL.photos.chatFallback.sent());
            openTelegramLink(config.botUrl);
        } catch (error) {
            toast.failure(toFailure(error));
        }
    };

    const errorFor = (field: DraftTextField) => {
        const code = shownErrors[field];

        return code === undefined
            ? null
            : draftErrorText(LL, field, code, limits);
    };

    const linkHost =
        clientErrors.link === undefined ? getLinkHost(draft.link.trim()) : null;
    const approximatePrice = getApproximateDraftPrice(
        draft.price,
        draft.currency,
        me.currency,
        locale,
        config.rates
    );
    const pendingTiles = photos.queue.items.map(item => {
        return {
            key: item.key,
            previewUrl: item.source.previewUrl,
            status: item.status,
            failure: item.failure
        };
    });

    return (
        <form
            class='editor'
            novalidate
            onSubmit={(event: Event) => {
                event.preventDefault();
                void save();
            }}
        >
            <Tag class='editor-sheet'>
                <Field
                    id={fieldId('title')}
                    label={LL.editor.title.label()}
                    hint={LL.editor.title.hint()}
                    placeholder={LL.editor.title.placeholder()}
                    value={draft.title}
                    onValue={setText('title')}
                    onBlur={touch('title')}
                    error={errorFor('title')}
                    maxLength={limits.title}
                    required
                    requiredMark={LL.editor.requiredMark()}
                    multiline
                    rows={2}
                />
                <Field
                    id={fieldId('description')}
                    label={LL.editor.description.label()}
                    hint={LL.editor.description.hint()}
                    placeholder={LL.editor.description.placeholder()}
                    value={draft.description}
                    onValue={setText('description')}
                    onBlur={touch('description')}
                    error={errorFor('description')}
                    maxLength={limits.description}
                    optionalMark={LL.common.optional()}
                    multiline
                    rows={4}
                />
                <Field
                    id={fieldId('price')}
                    label={LL.editor.price.label()}
                    hint={LL.editor.price.hint({
                        currency: getCurrencySymbol(locale, draft.currency)
                    })}
                    placeholder={LL.editor.price.placeholder()}
                    value={draft.price}
                    onValue={setText('price')}
                    onBlur={touch('price')}
                    error={errorFor('price')}
                    inputMode='decimal'
                    suffix={getCurrencySymbol(locale, draft.currency)}
                    optionalMark={LL.common.optional()}
                    showCounter={false}
                    after={
                        approximatePrice === null ? undefined : (
                            <p class='field-host' aria-live='polite'>
                                {LL.money.approx({ amount: approximatePrice })}
                            </p>
                        )
                    }
                />
                <Field
                    id={fieldId('link')}
                    label={LL.editor.link.label()}
                    hint={LL.editor.link.hint()}
                    placeholder={LL.editor.link.placeholder()}
                    value={draft.link}
                    onValue={setText('link')}
                    onBlur={touch('link')}
                    error={errorFor('link')}
                    type='url'
                    optionalMark={LL.common.optional()}
                    inputMode='url'
                    maxLength={limits.link}
                    showCounter={false}
                    after={
                        linkHost === null ? undefined : (
                            <p class='field-host'>
                                {LL.editor.link.host({ host: linkHost })}
                            </p>
                        )
                    }
                />
            </Tag>
            <Tag class='editor-sheet'>
                <PhotoPicker
                    title={draft.title.trim() || LL.editor.createTitle()}
                    images={wish?.images ?? []}
                    pending={pendingTiles}
                    max={limits.images}
                    waitingForSave={wish === null}
                    progress={photos.progress}
                    removing={removingPhoto}
                    onPick={photos.pick}
                    onRemove={removePhoto}
                    onRemoveAll={() => {
                        void removeAllPhotos();
                    }}
                    onRetry={photos.retry}
                    onDiscard={photos.discard}
                    {...(wish !== null && {
                        onChatFallback: () => {
                            void addPhotosInChat();
                        }
                    })}
                />
            </Tag>
            <Tag class='editor-sheet'>
                <Toggle
                    id='wish-priority'
                    label={LL.editor.priority.label()}
                    hint={LL.editor.priority.hint()}
                    pressed={isHighPriority(draft.priority)}
                    onToggle={next => {
                        setFlag('priority', next);
                    }}
                />
                <Toggle
                    id='wish-hidden'
                    label={LL.editor.hidden.label()}
                    hint={LL.editor.hidden.hint()}
                    pressed={draft.hidden}
                    onToggle={next => {
                        setFlag('hidden', next);
                    }}
                />
            </Tag>
            {wish === null ? null : (
                <div class='editor-footer'>
                    <p class='editor-dates'>
                        {LL.editor.createdAt({
                            date: formatIsoDate(wish.createdAt, locale)
                        })}
                        {wish.updatedAt === wish.createdAt ? null : (
                            <>
                                <br />
                                {LL.editor.updatedAt({
                                    date: formatIsoDate(wish.updatedAt, locale)
                                })}
                            </>
                        )}
                    </p>
                    <button
                        type='button'
                        class='btn btn-outline editor-remove'
                        disabled={removing}
                        aria-busy={String(removing)}
                        onClick={() => {
                            void removeWish();
                        }}
                    >
                        {removing ? (
                            <span
                                class='loading loading-spinner loading-sm'
                                aria-hidden='true'
                            />
                        ) : null}
                        {LL.editor.remove.action()}
                    </button>
                </div>
            )}
        </form>
    );
};

export const WishEditorScreen = ({ route }: ScreenProps<'wishEditor'>) => {
    const services = useApp();
    const LL = useLL();
    const entryKey = useEntryKey();
    const [wishId, setWishId] = useState<number | null>(route.wishId);
    const resource = useAppResource<OwnWishDto>(
        wishId === null ? null : wishItemKey(wishId),
        signal => {
            return services.api.request('getWish', {
                params: { id: wishId ?? 0 },
                signal
            });
        }
    );
    const failure = resource.failure;
    const missing = failure !== null && hasErrorCode(failure, 'notFound');

    useEffect(() => {
        if (missing && wishId !== null) {
            forgetWish(services, wishId);
            services.toast.failure(failure);
            services.nav.setDirty(entryKey, false);
            void services.nav.back();
        }
    }, [missing]);

    const waiting = wishId !== null && resource.data === undefined;

    return (
        <ScreenLayout
            id='wishEditor'
            title={
                wishId === null
                    ? LL.editor.createTitle()
                    : LL.editor.editTitle()
            }
            busy={waiting && failure === null}
        >
            {waiting ? (
                failure === null || missing ? (
                    <TagSkeletons count={2} />
                ) : (
                    <ErrorState
                        failure={failure}
                        onRetry={() => {
                            void resource.reload();
                        }}
                    />
                )
            ) : (
                <WishForm
                    wish={resource.data ?? null}
                    onCreated={created => {
                        services.cache.mutate<OwnWishDto>(
                            wishItemKey(created.id),
                            () => created
                        );
                        setWishId(created.id);
                    }}
                    onReload={() => {
                        void resource.reload();
                    }}
                />
            )}
        </ScreenLayout>
    );
};
