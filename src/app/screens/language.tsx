import { useState } from 'hono/jsx/dom';

import type { AppLanguageChoice } from '../../shared/app-api';
import { resolveSystemLocale } from '../i18n/system-texts';
import { getLanguageChoices } from '../logic/language-choices';
import type { ScreenProps } from '../nav/routes';
import { useApp, useLL, useSession } from '../state/context';
import { toFailure } from '../state/store';
import { haptics } from '../telegram/haptics';
import { getLaunchContext } from '../telegram/sdk';
import { ChoiceCards, type ChoiceOption } from '../ui/choice-cards';
import { ScreenLayout } from '../ui/screen';

const LANGUAGE_GLYPHS: Record<AppLanguageChoice, string> = {
    uk: '🇺🇦',
    en: '🇺🇸',
    pl: '🇵🇱',
    auto: '🎲'
};

export const LanguageScreen = (_props: ScreenProps<'language'>) => {
    const LL = useLL();
    const { api, cache, session, toast, applyLanguage } = useApp();
    const { me, locale } = useSession();
    const [pending, setPending] = useState<AppLanguageChoice | null>(null);
    const telegramLocale =
        me.languageChoice === 'auto'
            ? me.locale
            : resolveSystemLocale(
                  getLaunchContext().webApp?.initDataUnsafe.user?.language_code
              );
    const options = getLanguageChoices(locale).map(
        (choice): ChoiceOption<AppLanguageChoice> => {
            return choice === 'auto'
                ? {
                      value: choice,
                      glyph: LANGUAGE_GLYPHS.auto,
                      title: LL.language.auto(),
                      hint: LL.language.autoHint({
                          language: LL.language.names[telegramLocale]()
                      })
                  }
                : {
                      value: choice,
                      glyph: LANGUAGE_GLYPHS[choice],
                      title: LL.language.native[choice]()
                  };
        }
    );

    const choose = async (choice: AppLanguageChoice) => {
        if (pending !== null || choice === me.languageChoice) {
            return;
        }

        setPending(choice);

        try {
            applyLanguage(
                await api.request('setLanguage', { body: { choice } })
            );
            cache.invalidate('releases');
            haptics.success();
            toast.show(session.get().LL.language.saved(), 'success');
        } catch (error) {
            toast.failure(toFailure(error));
        }

        setPending(null);
    };

    return (
        <ScreenLayout
            id='language'
            title={LL.language.title()}
            lead={LL.language.lead()}
        >
            <ChoiceCards
                name='language'
                legend={LL.language.title()}
                options={options}
                variant='list'
                value={pending ?? me.languageChoice}
                disabled={pending !== null}
                onChange={choice => {
                    void choose(choice);
                }}
            />
        </ScreenLayout>
    );
};
