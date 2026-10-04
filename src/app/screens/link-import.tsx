import { useEffect, useState } from 'hono/jsx/dom';
import { ClipboardPaste } from 'lucide';

import { LINK_IMPORT_CLIENT_TIMEOUT_MS } from '../../shared/app-api';
import {
    classifyImportFailure,
    linkOnlyStart,
    parseImportTarget,
    startFromResult,
    type ImportFailureReason,
    type ImportStart,
    type ImportTarget
} from '../logic/link-import';
import type { ScreenProps } from '../nav/routes';
import { useApp, useLL, useSession } from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { canReadClipboard, readClipboardText } from '../ui/clipboard';
import { Field } from '../ui/field';
import { Icon } from '../ui/icon';
import { ScreenLayout } from '../ui/screen';
import { TagSkeletons } from '../ui/skeleton';
import { Tag } from '../ui/tag';
import { WishEditorView } from './wish-editor';

const URL_FIELD_ID = 'link-import-url';

interface LinkStepProps {
    onOpenEditor: (start: ImportStart | null) => void;
}

const LinkStep = ({ onOpenEditor }: LinkStepProps) => {
    const LL = useLL();
    const { api, reportEvent, toast } = useApp();
    const { me, config } = useSession();
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<ImportTarget | null>(null);
    const [lifecycle] = useState(() => {
        return { alive: true, controller: null as AbortController | null };
    });
    const target = parseImportTarget(text);

    useEffect(() => {
        return () => {
            lifecycle.alive = false;
            lifecycle.controller?.abort();
        };
    }, []);

    const openLinkOnly = (link: string, reason: ImportFailureReason | null) => {
        onOpenEditor(linkOnlyStart(link, me.currency, reason));
    };

    const run = async (importTarget: ImportTarget) => {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, LINK_IMPORT_CLIENT_TIMEOUT_MS);

        lifecycle.controller = controller;
        setError(null);
        setLoading(importTarget);

        try {
            const result = await api.request('importLink', {
                body: { url: importTarget.url },
                signal: controller.signal,
                handleDisabledLocally: true
            });

            if (!lifecycle.alive) {
                return;
            }

            const start = startFromResult(result, importTarget, me.currency);

            if (start === null) {
                setLoading(null);
                setError(LL.linkImport.errors.invalidUrl());

                return;
            }

            onOpenEditor(start);
        } catch (caught) {
            if (!lifecycle.alive) {
                return;
            }

            if (timedOut) {
                reportEvent('importTimeout', 'linkImport');
                openLinkOnly(importTarget.url, 'timeout');

                return;
            }

            const failure = toFailure(caught);
            const kind = classifyImportFailure(failure);

            haptics.error();

            if (kind === 'disabled') {
                openLinkOnly(importTarget.url, null);
            } else if (kind === 'rateLimited') {
                openLinkOnly(importTarget.url, 'rateLimited');
            } else {
                setLoading(null);

                if (kind === 'invalidUrl') {
                    reportEvent('validationFailed', 'linkImport', {
                        field: 'link',
                        code: 'invalid'
                    });
                    setError(LL.linkImport.errors.invalidUrl());
                } else {
                    toast.failure(failure);
                }
            }
        } finally {
            clearTimeout(timer);
        }
    };

    const submit = () => {
        if (loading === null && target !== null) {
            void run(target);
        }
    };

    const paste = async () => {
        const pasted = await readClipboardText();

        if (pasted === null || !lifecycle.alive) {
            document.getElementById(URL_FIELD_ID)?.focus();

            return;
        }

        setText(parseImportTarget(pasted)?.url ?? pasted.trim());
        setError(null);
    };

    useBottomButton({
        text: LL.linkImport.continue(),
        disabled: target === null || loading !== null,
        progress: loading !== null,
        onClick: submit
    });

    if (loading !== null) {
        return (
            <ScreenLayout id='linkImport' title={LL.linkImport.title()} busy>
                <p class='import-loading' role='status'>
                    {LL.linkImport.loading({ host: loading.host })}
                </p>
                <TagSkeletons count={3} />
            </ScreenLayout>
        );
    }

    return (
        <ScreenLayout
            id='linkImport'
            title={LL.linkImport.title()}
            lead={LL.linkImport.hint()}
        >
            <form
                class='link-import-form'
                novalidate
                onSubmit={(event: Event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <Tag class='editor-sheet'>
                    <Field
                        id={URL_FIELD_ID}
                        label={LL.linkImport.urlLabel()}
                        placeholder={LL.linkImport.urlPlaceholder()}
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
                                    {LL.linkImport.paste()}
                                </button>
                            ) : undefined
                        }
                    />
                </Tag>
                <div class='link-import-actions'>
                    <button
                        type='button'
                        class='text-button'
                        onClick={() => {
                            onOpenEditor(null);
                        }}
                    >
                        {LL.linkImport.withoutLink()}
                    </button>
                </div>
            </form>
        </ScreenLayout>
    );
};

/** First step of adding a wish: paste a product link to prefill the editor, or skip to an empty one. */
export const LinkImportScreen = (_props: ScreenProps<'linkImport'>) => {
    const [editor, setEditor] = useState<{ start: ImportStart | null } | null>(
        null
    );

    useEffect(() => {
        if (editor !== null) {
            document
                .querySelector<HTMLElement>('main h1')
                ?.focus({ preventScroll: true });
        }
    }, [editor !== null]);

    return (
        <div class='link-import-host'>
            {editor === null ? (
                <LinkStep
                    onOpenEditor={start => {
                        setEditor({ start });
                    }}
                />
            ) : (
                <WishEditorView
                    layoutId='linkImport'
                    wishId={null}
                    importStart={editor.start}
                />
            )}
        </div>
    );
};
