import { useState } from 'hono/jsx/dom';

import { countCharacters } from '../logic/format';
import type { ScreenProps } from '../nav/routes';
import { useApp, useLL, useNav, useSession } from '../state/context';
import { toFailure } from '../state/store';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { Field } from '../ui/field';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

type NegativeStatus = 'notFound' | 'self' | 'tooLong';

export const FindScreen = (_props: ScreenProps<'find'>) => {
    const LL = useLL();
    const nav = useNav();
    const { api, toast, reportEvent } = useApp();
    const { config } = useSession();
    const [query, setQuery] = useState('');
    const [problem, setProblem] = useState<NegativeStatus | 'empty' | null>(
        null
    );
    const [searching, setSearching] = useState(false);
    const max = config.limits.findQuery;
    const trimmed = query.trim();

    const describeProblem = (status: NegativeStatus | 'empty') => {
        return status === 'tooLong'
            ? LL.find.errors.tooLong({ max })
            : LL.find.errors[status]();
    };

    const search = async () => {
        if (searching) {
            return;
        }

        if (trimmed === '') {
            setProblem('empty');
            haptics.error();
            reportEvent('validationFailed', 'find', {
                field: 'query',
                code: 'empty'
            });

            return;
        }

        if (countCharacters(trimmed) > max) {
            setProblem('tooLong');
            haptics.error();
            reportEvent('validationFailed', 'find', {
                field: 'query',
                code: 'tooLong'
            });

            return;
        }

        setSearching(true);
        setProblem(null);

        try {
            const result = await api.request('search', {
                body: { query: trimmed }
            });

            if (result.status === 'found') {
                haptics.success();
                nav.push({
                    screen: 'thirdList',
                    source: { kind: 'owner', owner: result.owner }
                });

                return;
            }

            haptics.error();
            setProblem(result.status);
        } catch (error) {
            toast.failure(toFailure(error));
        }

        setSearching(false);
    };

    useBottomButton({
        text: searching ? LL.find.searching() : LL.find.submit(),
        disabled: trimmed === '',
        progress: searching,
        onClick: () => {
            void search();
        }
    });

    return (
        <ScreenLayout id='find' title={LL.find.title()}>
            <form
                class='find-form'
                onSubmit={(event: Event) => {
                    event.preventDefault();
                    void search();
                }}
            >
                <Field
                    id='find-query'
                    label={LL.find.label()}
                    hint={LL.find.hint()}
                    placeholder={LL.find.placeholder()}
                    value={query}
                    error={problem === null ? null : describeProblem(problem)}
                    showCounter={false}
                    onValue={value => {
                        setQuery(value);
                        setProblem(null);
                    }}
                />
            </form>
            {problem === 'notFound' ? (
                <Tag class='find-reasons'>
                    <h2 class='panel-title'>{LL.find.reasons.title()}</h2>
                    <ul class='find-reason-list'>
                        <li>{LL.find.reasons.notUser()}</li>
                        <li>{LL.find.reasons.phoneHidden()}</li>
                    </ul>
                </Tag>
            ) : null}
        </ScreenLayout>
    );
};
