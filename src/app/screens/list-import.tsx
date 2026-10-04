import { useEffect, useState } from 'hono/jsx/dom';
import {
    Ban,
    Banknote,
    ClipboardPaste,
    Copy,
    Gift,
    Image,
    Info,
    Link2,
    PartyPopper
} from 'lucide';

import {
    LIST_IMPORT_CLIENT_TIMEOUT_MS,
    LIST_IMPORT_VISIBILITIES,
    type ListImportCountsDto,
    type ListImportSource,
    type ListImportStatusDto,
    type ListImportVisibility
} from '../../shared/app-api';
import {
    canStartImport,
    classifyPreviewFailure,
    commitRefusal,
    createListImportFlow,
    decidePoll,
    hasPhotosToLoad,
    isImportFinishedForGood,
    parseListImportTarget,
    previewCountLines,
    reduceListImportFlow,
    shouldGiveUpPolling,
    toReadyPreview,
    type ListImportEvent,
    type ListImportFlow,
    type ListImportTarget,
    type PreviewCountKey,
    type PreviewNotice
} from '../logic/list-import';
import type { ScreenProps } from '../nav/routes';
import { useApp, useLL, useSession } from '../state/context';
import { toFailure, useLatest } from '../state/store';
import { useBottomButton, type BottomButtonConfig } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { canReadClipboard, readClipboardText } from '../ui/clipboard';
import { ChoiceCards } from '../ui/choice-cards';
import { Field } from '../ui/field';
import { Icon, type IconNode } from '../ui/icon';
import { ScreenLayout } from '../ui/screen';
import { Segmented } from '../ui/segmented';
import { TagSkeletons } from '../ui/skeleton';
import { Tag } from '../ui/tag';
import { WISHES_PREFIX } from './wishes';

const URL_FIELD_ID = 'list-import-url';
const SOURCE_HEADING_ID = 'list-import-source';
const VISIBILITY_HEADING_ID = 'list-import-visibility';
const VISIBILITY_HINT_ID = 'list-import-visibility-hint';

const COUNT_ICONS: Record<PreviewCountKey, IconNode> = {
    active: Gift,
    gifted: PartyPopper,
    duplicates: Copy,
    withoutPrice: Banknote,
    overLimit: Ban
};

const waitFor = (milliseconds: number, signal: AbortSignal) => {
    return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, milliseconds);

        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);
                resolve();
            },
            { once: true }
        );
    });
};

const CountLines = ({ counts }: { counts: ListImportCountsDto }) => {
    const LL = useLL();
    const texts = LL.listImport.preview;

    return (
        <ul class='import-lines'>
            {previewCountLines(counts).map(line => {
                return (
                    <li key={line.key} class='import-line'>
                        <Icon icon={COUNT_ICONS[line.key]} class='row-icon' />
                        <span class='row-label'>
                            {texts[line.key]({ count: line.count })}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};

const NoteLine = ({ icon, text }: { icon: IconNode; text: string }) => {
    return (
        <p class='import-line'>
            <Icon icon={icon} class='row-icon' />
            <span class='row-label'>{text}</span>
        </p>
    );
};

const ProgressTag = ({ status }: { status: ListImportStatusDto }) => {
    const LL = useLL();
    const text = LL.listImport.progress.text({
        created: status.created,
        planned: status.planned
    });

    return (
        <Tag>
            <div class='import-card'>
                <p class='import-status' role='status'>
                    {text}
                </p>
                <progress
                    class='import-progress'
                    value={status.created}
                    max={Math.max(status.planned, 1)}
                    aria-label={LL.listImport.progress.title()}
                />
                <NoteLine icon={Image} text={LL.listImport.progress.photos()} />
            </div>
        </Tag>
    );
};

const SettledTag = ({ status }: { status: ListImportStatusDto }) => {
    const LL = useLL();
    const failed = status.state !== 'done';

    return (
        <Tag>
            <div class='import-card'>
                <p class='import-status' role='status'>
                    {failed
                        ? LL.listImport.failed.text({ created: status.created })
                        : LL.listImport.done.text({ created: status.created })}
                </p>
                {failed && status.failure !== null ? (
                    <NoteLine
                        icon={Info}
                        text={LL.listImport.failure[status.failure]()}
                    />
                ) : null}
                {!failed && status.createdGifted > 0 ? (
                    <NoteLine
                        icon={PartyPopper}
                        text={LL.listImport.done.gifted({
                            gifted: status.createdGifted
                        })}
                    />
                ) : null}
                {!failed && status.photosPending > 0 ? (
                    <>
                        <NoteLine
                            icon={Image}
                            text={LL.listImport.done.photosLeft({
                                count: status.photosPending
                            })}
                        />
                        <NoteLine
                            icon={Info}
                            text={LL.listImport.progress.photos()}
                        />
                    </>
                ) : null}
            </div>
        </Tag>
    );
};

/** Moves a rewish.io list into the wish list in steps: pick the source, paste the link, review what was found and how to import it, then watch the wishes arrive. The preview never writes; the server runs the commit in the background, so leaving the screen does not stop it. */
export const ListImportScreen = (_props: ScreenProps<'listImport'>) => {
    const LL = useLL();
    const { api, cache, nav, reloadSession, reportEvent, toast } = useApp();
    const { config } = useSession();
    const [flow, setFlow] = useState<ListImportFlow>(createListImportFlow);
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [pollTimedOut, setPollTimedOut] = useState(false);
    const [lifecycle] = useState(() => {
        return {
            alive: true,
            finished: false,
            controller: null as AbortController | null
        };
    });
    const latestFlow = useLatest(flow);
    const target = parseListImportTarget(text);
    const pollJobId =
        flow.step === 'progress' || flow.step === 'done'
            ? flow.status.jobId
            : null;

    const dispatch = (event: ListImportEvent) => {
        setFlow(current => reduceListImportFlow(current, event));
    };

    useEffect(() => {
        return () => {
            lifecycle.alive = false;
            lifecycle.controller?.abort();
        };
    }, []);

    const finish = (status: ListImportStatusDto) => {
        if (lifecycle.finished) {
            return;
        }

        lifecycle.finished = true;
        haptics.success();
        toast.show(LL.listImport.toast({ count: status.created }), 'success');
        void nav.navigateTo('wishes', 'replace');
    };

    useEffect(() => {
        if (flow.step !== 'done' && flow.step !== 'failed') {
            return;
        }

        cache.invalidate(WISHES_PREFIX);
        void reloadSession().catch(() => undefined);

        if (flow.step === 'done' && isImportFinishedForGood(flow.status)) {
            finish(flow.status);
        }
    }, [flow.step]);

    useEffect(() => {
        if (pollJobId === null) {
            return undefined;
        }

        const controller = new AbortController();
        const { signal } = controller;

        const poll = async () => {
            const initial = latestFlow.current;

            if (initial.step !== 'progress' && initial.step !== 'done') {
                return;
            }

            let current = initial.status;
            let phaseStartedAt = Date.now();
            let failures = 0;

            while (!signal.aborted) {
                const decision = decidePoll(
                    current,
                    Date.now() - phaseStartedAt
                );

                if (decision.action === 'stop') {
                    if (decision.reason === 'timeout') {
                        reportEvent('importTimeout', 'listImport');
                        setPollTimedOut(true);
                    }

                    return;
                }

                await waitFor(decision.delayMs, signal);

                if (signal.aborted) {
                    return;
                }

                try {
                    const next = await api.request('getListImport', {
                        params: { id: pollJobId },
                        signal
                    });

                    if (signal.aborted) {
                        return;
                    }

                    failures = 0;

                    if (next.state !== current.state) {
                        phaseStartedAt = Date.now();
                    }

                    current = next;
                    dispatch({ type: 'statusUpdated', status: next });
                } catch (caught) {
                    failures += 1;

                    if (signal.aborted) {
                        return;
                    }

                    if (shouldGiveUpPolling(failures)) {
                        toast.failure(toFailure(caught));
                        setPollTimedOut(true);

                        return;
                    }
                }
            }
        };

        void poll();

        return () => {
            controller.abort();
        };
    }, [pollJobId]);

    const runPreview = async (importTarget: ListImportTarget) => {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, LIST_IMPORT_CLIENT_TIMEOUT_MS);

        lifecycle.controller = controller;
        setError(null);
        setLoading(true);

        try {
            const preview = await api.request('previewListImport', {
                body: { url: importTarget.url },
                signal: controller.signal
            });

            if (!lifecycle.alive) {
                return;
            }

            if (toReadyPreview(preview) !== null) {
                dispatch({ type: 'previewLoaded', preview });

                return;
            }

            haptics.error();
            setError(
                LL.listImport.failure[
                    preview.outcome === 'ok' ? 'upstream' : preview.outcome
                ]()
            );
        } catch (caught) {
            if (!lifecycle.alive) {
                return;
            }

            haptics.error();

            if (timedOut) {
                reportEvent('importTimeout', 'listImport');
                setError(LL.listImport.failure.timeout());

                return;
            }

            const failure = toFailure(caught);

            if (classifyPreviewFailure(failure) === 'invalidUrl') {
                setError(LL.listImport.failure.invalidUrl());
            } else {
                toast.failure(failure);
            }
        } finally {
            clearTimeout(timer);

            if (lifecycle.alive) {
                setLoading(false);
            }
        }
    };

    const runCommit = async (
        jobId: number,
        visibility: ListImportVisibility
    ) => {
        setLoading(true);

        try {
            const status = await api.request('commitListImport', {
                params: { id: jobId },
                body: { visibility }
            });

            if (!lifecycle.alive) {
                return;
            }

            const refusal = commitRefusal(status);

            if (refusal === null) {
                dispatch({ type: 'commitStarted', status });

                return;
            }

            haptics.error();
            dispatch({ type: 'commitRefused', failure: refusal });
            toast.show(LL.listImport.failure[refusal](), 'error');
        } catch (caught) {
            if (lifecycle.alive) {
                haptics.error();
                toast.failure(toFailure(caught));
            }
        } finally {
            if (lifecycle.alive) {
                setLoading(false);
            }
        }
    };

    const noticeText = (notice: PreviewNotice) => {
        return notice === 'limitReached'
            ? LL.listImport.failure.limitReached()
            : LL.listImport.preview.nothing();
    };

    const submitUrl = () => {
        if (!loading && target !== null) {
            void runPreview(target);
        }
    };

    const paste = async () => {
        const pasted = await readClipboardText();

        if (pasted === null || !lifecycle.alive) {
            document.getElementById(URL_FIELD_ID)?.focus();

            return;
        }

        setText(parseListImportTarget(pasted)?.url ?? pasted.trim());
        setError(null);
    };

    const bottomButton = (): BottomButtonConfig | null => {
        switch (flow.step) {
            case 'source':
                return {
                    text: LL.listImport.continue(),
                    onClick: () => {
                        dispatch({ type: 'sourceConfirmed' });
                    }
                };
            case 'url':
                return {
                    text: LL.listImport.continue(),
                    disabled: target === null || loading,
                    progress: loading,
                    onClick: submitUrl
                };
            case 'preview': {
                const { preview, visibility } = flow;

                if (!canStartImport(preview)) {
                    return null;
                }

                return {
                    text: LL.listImport.start(),
                    disabled: loading,
                    progress: loading,
                    onClick: () => {
                        void runCommit(preview.jobId, visibility);
                    }
                };
            }
            case 'progress':
                return pollTimedOut
                    ? {
                          text: LL.listImport.done.cta(),
                          onClick: () => {
                              finish(flow.status);
                          }
                      }
                    : {
                          text: LL.listImport.progress.title(),
                          disabled: true,
                          progress: true,
                          onClick: () => undefined
                      };
            case 'done':
                return {
                    text: LL.listImport.done.cta(),
                    onClick: () => {
                        finish(flow.status);
                    }
                };
            case 'failed':
                return {
                    text: LL.listImport.failed.retry(),
                    onClick: () => {
                        dispatch({ type: 'restarted' });
                    }
                };
        }
    };

    useBottomButton(bottomButton());

    if (flow.step === 'source') {
        return (
            <ScreenLayout
                id='listImport'
                title={LL.listImport.title()}
                lead={LL.listImport.hint()}
            >
                <section class='menu-group' aria-labelledby={SOURCE_HEADING_ID}>
                    <h2 id={SOURCE_HEADING_ID} class='menu-group-title'>
                        {LL.listImport.sourceLabel()}
                    </h2>
                    <ChoiceCards<ListImportSource>
                        name='list-import-source'
                        legend={LL.listImport.sourceLabel()}
                        variant='list'
                        value={flow.source}
                        options={[
                            {
                                value: 'rewish',
                                title: LL.listImport.sources.rewish(),
                                icon: Link2
                            }
                        ]}
                        onChange={source => {
                            dispatch({ type: 'sourcePicked', source });
                        }}
                    />
                </section>
            </ScreenLayout>
        );
    }

    if (flow.step === 'url' && loading) {
        return (
            <ScreenLayout id='listImport' title={LL.listImport.title()} busy>
                <p class='import-loading' role='status'>
                    {LL.listImport.loading()}
                </p>
                <TagSkeletons count={3} />
            </ScreenLayout>
        );
    }

    if (flow.step === 'url') {
        return (
            <ScreenLayout
                id='listImport'
                title={LL.listImport.title()}
                lead={LL.listImport.hint()}
            >
                <form
                    class='link-import-form'
                    novalidate
                    onSubmit={(event: Event) => {
                        event.preventDefault();
                        submitUrl();
                    }}
                >
                    <Tag class='editor-sheet'>
                        <Field
                            id={URL_FIELD_ID}
                            label={LL.listImport.urlLabel()}
                            placeholder={LL.listImport.urlPlaceholder()}
                            hint={LL.listImport.urlHint()}
                            value={text}
                            onValue={value => {
                                setText(value);
                                setError(null);
                            }}
                            error={error}
                            type='url'
                            inputMode='url'
                            maxLength={config.limits.link}
                            showCounter={false}
                            after={
                                canReadClipboard() ? (
                                    <button
                                        type='button'
                                        class='btn btn-sm link-import-paste'
                                        onClick={() => {
                                            void paste();
                                        }}
                                    >
                                        <Icon icon={ClipboardPaste} />
                                        {LL.listImport.paste()}
                                    </button>
                                ) : undefined
                            }
                        />
                    </Tag>
                </form>
            </ScreenLayout>
        );
    }

    if (flow.step === 'preview') {
        const { preview, visibility } = flow;
        const visibilityHint =
            visibility === 'hidden'
                ? LL.listImport.visibility.hiddenHint()
                : LL.listImport.visibility.publicHint();

        return (
            <ScreenLayout
                id='listImport'
                title={LL.listImport.title()}
                busy={loading}
            >
                <div class='import-body'>
                    <Tag>
                        <div class='import-card'>
                            <h2 class='import-card-title'>
                                {LL.listImport.preview.title()}
                            </h2>
                            <CountLines counts={preview.counts} />
                            {hasPhotosToLoad(preview.counts) ? (
                                <NoteLine
                                    icon={Image}
                                    text={LL.listImport.preview.photosNote()}
                                />
                            ) : null}
                            {preview.savedWishesNote ? (
                                <NoteLine
                                    icon={Info}
                                    text={LL.listImport.preview.savedNote()}
                                />
                            ) : null}
                            {preview.notice === null ? null : (
                                <NoteLine
                                    icon={Info}
                                    text={noticeText(preview.notice)}
                                />
                            )}
                        </div>
                    </Tag>
                    {canStartImport(preview) ? (
                        <section
                            class='menu-group'
                            aria-labelledby={VISIBILITY_HEADING_ID}
                        >
                            <h2
                                id={VISIBILITY_HEADING_ID}
                                class='menu-group-title'
                            >
                                {LL.listImport.visibility.label()}
                            </h2>
                            <Segmented<ListImportVisibility>
                                name='list-import-visibility'
                                legend={LL.listImport.visibility.label()}
                                describedBy={VISIBILITY_HINT_ID}
                                disabled={loading}
                                value={visibility}
                                options={LIST_IMPORT_VISIBILITIES.map(value => {
                                    return {
                                        value,
                                        label: LL.listImport.visibility[value]()
                                    };
                                })}
                                onChange={value => {
                                    dispatch({
                                        type: 'visibilityChanged',
                                        visibility: value
                                    });
                                }}
                            />
                            <p id={VISIBILITY_HINT_ID} class='field-hint'>
                                {visibilityHint}
                            </p>
                        </section>
                    ) : null}
                </div>
            </ScreenLayout>
        );
    }

    if (flow.step === 'progress') {
        return (
            <ScreenLayout
                id='listImport'
                title={LL.listImport.progress.title()}
                busy={!pollTimedOut}
            >
                <ProgressTag status={flow.status} />
            </ScreenLayout>
        );
    }

    return (
        <ScreenLayout
            id='listImport'
            title={
                flow.step === 'done'
                    ? LL.listImport.done.title()
                    : LL.listImport.failed.title()
            }
        >
            <SettledTag status={flow.status} />
        </ScreenLayout>
    );
};
