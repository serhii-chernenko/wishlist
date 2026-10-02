import type { Translation } from '../i18n-types';

const pl: Translation = {
    title: 'Lista życzeń ❤️',
    errors: {
        unknown: '🤷 Ups, coś poszło nie tak...',
        outdatedButton: 'Ten przycisk jest już nieaktualny. Oto menu główne 👇'
    },
    language: {
        title: '🇺🇦 UA | 🇺🇸 EN | 🇵🇱 PL',
        description:
            '🇺🇦 Змінити мову для інтерфейсу боту.\n🇺🇸 Change a language of the bot interface.\n🇵🇱 Zmień język interfejsu bota.\n\n🎲 Якщо обрати автоматичний режим, мова інтерфейсу боту буде така сама, як вказана в налаштуваннях Телеграму.\n🎲 If you choose the auto mode, a language of bot interface will be the same as it set in Telegram preferences.\n🎲 Jeśli wybierzesz tryb automatyczny, język interfejsu bota będzie taki sam jak ustawiony w Telegramie.',
        options: {
            uk: '🇺🇦 Українська | Ukrainian | Ukraiński',
            en: '🇺🇸 Англійська | English | Angielski',
            pl: '🇵🇱 Польська | Polish | Polski',
            auto: '🎲 Автоматично | Auto | Automatycznie'
        },
        names: {
            uk: 'ukraiński',
            en: 'angielski',
            pl: 'polski',
            auto: 'automatyczny'
        },
        success: '✅ Język interfejsu został zmieniony: {0}',
        current: 'Aktualny język: {0}',
        invalid: '❌ Nieznany język: {0}\nDostępne opcje: uk, en, pl, auto'
    },
    actions: {
        home: '🏠 Strona główna',
        back: '🔙 Wróć',
        open: '🔗 Otwórz',
        edit: '✏️ Edytuj',
        remove: '❌ Usuń',
        clean: '🧹 Wyczyść',
        share: '💌 Podziel się',
        yes: '✅ Tak',
        no: '❌ Nie',
        more: 'Pokaż więcej',
        language: '🌐'
    },
    greeting: {
        general:
            'Hejka!\nJak często zdarza ci się nie wiedzieć, co podarować ważnej dla ciebie osobie,\nalbo nie móc sobie przypomnieć, czego sam pragniesz, gdy ktoś pyta - „<i>co ci podarować?</i>”?\nNie wiem jak ty, ale ja mam tak ciągle...\nJest wyjście! Ale nie przez okno :D\nPodziel się tym botem z rodziną, przyjaciółmi i znajomymi, żeby ułatwić życie im i sobie)',
        guest: 'W tym bocie możesz:\n\n❤️ Przejść do własnej listy życzeń.\n🎁 Przeglądać własną listę <b>Chcę podarować</b>.\n🔎 Znaleźć listę życzeń innej osoby.\n\n👤 <b>Ale najpierw musisz się zarejestrować.</b>\n\n🧐 A teraz możesz kliknąć\n<b>Dowiedz się więcej</b>, żeby poznać szczegóły o bocie i o tym, jak wykorzystujemy dane.\n\n💬 Albo jeśli coś nie działa, daj znać, klikając przycisk <b>Zostaw opinię</b>',
        user: 'Co chcesz zrobić?'
    },
    privacy: {
        title: '🧐 Dowiedz się więcej',
        description: {
            sensitive:
                '<b>Dane prywatne</b>\n\nNumer telefonu to prywatna informacja każdego użytkownika!\nTe dane posłużą wyłącznie do wyszukiwania list życzeń innych użytkowników, jeśli znasz ich numer.\nBot ma otwarty kod (open source), który możesz obejrzeć pod linkiem do GitHuba.\nBaza użytkowników jest przechowywana w Cloudflare z solidną ochroną!\nBot zapisuje wyłącznie twoją nazwę użytkownika i/lub numer telefonu.\nŻadnych imion, żadnych nazwisk!\nDzięki za zainteresowanie tak ważnym tematem ❤️',
            openSource:
                '\n\n<b>Otwarty kod (Open Source)</b>\n\nOtwarty kod oznacza, że każdy chętny może\n- włączyć się w ulepszanie projektu\n- zobaczyć, jak napisany jest kod\n- ponadto projekt ma licencję GNU AGPLv3, co oznacza, że kod można w pełni skopiować do dowolnego innego projektu, nawet komercyjnego.',
            languages:
                '\n\n<b>Języki</b>\n\nBot mówi po ukraińsku, angielsku i polsku.\nJęzyk możesz zmienić przyciskiem 🌐 lub poleceniem /lang, a w trybie automatycznym bot dopasuje się do języka twojego Telegrama.\nJeśli chcesz pomóc w tłumaczeniach na inne języki, zostaw swoje dane kontaktowe w opinii.',
            feedback: '\n\n<b>Zostaw opinię</b>',
            otherProjects: {
                title: '\n\n<b>Inne projekty</b>',
                projects: {
                    princess:
                        'Bot na Telegramie stworzony wyłącznie dla zabawy - Księżniczka dnia.\nWybiera losowego uczestnika społeczności, który zostanie księżniczką dnia, i generuje miłe powitanie ☺️',
                    youtube:
                        'Kanał na YouTubie, na którym uczę programowania i dzielę się swoim doświadczeniem.',
                    telegram:
                        'Kanał na Telegramie, który powstał obok kanału na YouTubie - na ciekawostki zza kulis i kontakt z widzami.'
                }
            }
        },
        links: {
            github: '🔗 GitHub',
            x: '🔗 X',
            princess: '🔗 Księżniczka dnia 🇺🇦',
            youtube: '🔗 YouTube',
            telegram: '🔗 Kanał na Telegramie'
        }
    },
    feedback: {
        title: '💬 Zostaw opinię',
        description: {
            title: '💬 Tu możesz napisać wszystko, co myślisz)',
            points: '\n\n- jak bardzo podoba ci się bot 😅\n- coś się zepsuło i trzeba to naprawić\n- propozycje usprawnień\n- chcesz pomóc w tłumaczeniu na inne języki\n\nJeśli potrzebujesz odpowiedzi, zostaw dane kontaktowe, na przykład nazwę użytkownika w Telegramie, numer telefonu albo adres e-mail, żebym mógł do ciebie napisać i pomóc rozwiązać problem.'
        },
        message: '#opinia od {0}\n\n{1}',
        success: 'Dzięki za wiadomość ☺️\nPrzeczytam jak najszybciej!',
        errors: {
            tooLong:
                '❌ Ta opinia jest za długa! Maksymalnie {0} znaków.\nSkróć ją i wyślij jeszcze raz.'
        }
    },
    auth: {
        title: {
            guest: '👤 Zarejestruj się',
            user: '👤 Zmień widoczność'
        },
        description: {
            general: 'Jak chcesz, żeby inni użytkownicy cię znajdowali?',
            user: '<b>Obecnie można cię znaleźć:</b>\n{0}',
            guest: '\n\n<b>Wybór możesz później zmienić!</b>',
            username:
                '\n\nPonadto jeśli wybierzesz:\n{username}\nlub\n{both},\nto po zmianie nazwy użytkownika w ustawieniach Telegrama zostanie ona automatycznie zaktualizowana w bazie bota przy najbliższym korzystaniu z niego.\nCzyli po zmianie nazwy użytkownika nie trzeba będzie nic aktualizować.'
        },
        types: {
            username: '👤 Tylko po nazwie użytkownika',
            phone: '📱 Tylko po numerze telefonu',
            both: '👤 📱 Po nazwie użytkownika i po numerze'
        },
        sendNumber: {
            title: '📱 Wyślij numer',
            description:
                'Potrzebuję twojego numeru, żeby dodać go do bazy wyszukiwania.\nNie martw się, nie będzie używany do niczego poza wyszukiwaniem.\n\nKliknij przycisk:\n📱 <b>Wyślij numer</b>\nNie musisz wpisywać numeru ręcznie!'
        },
        errors: {
            username:
                '❌ Nie masz teraz nazwy użytkownika.\nSpróbuj dodać ją w ustawieniach Telegrama i wróć ;)',
            phone: '❌ To nie wygląda na numer telefonu, spróbuj jeszcze raz.\nUpewnij się, że klikasz przycisk <b>Wyślij numer</b> na dole przy klawiaturze, a nie wpisujesz numeru ręcznie w wiadomości.',
            foreignContact:
                '❌ To nie jest twój kontakt.\nKliknij przycisk <b>Wyślij numer</b> na dole przy klawiaturze, żeby udostępnić własny numer.'
        },
        success: {
            user: '✅ Twoje dane zostały zaktualizowane!',
            guest: '✅ Twoje dane są już w bazie!',
            username:
                '\n👤 Będzie można cię znaleźć po nazwie użytkownika:\n@{0}',
            phone: '\n📱 Będzie można cię znaleźć po numerze telefonu:\n{0}',
            both: '\nBędzie można cię znaleźć\n👤 Po nazwie użytkownika: @{0}\n📱 I po numerze telefonu: {1}'
        }
    },
    wishlist: {
        title: '❤️ Moja lista życzeń',
        empty: 'Na twojej liście życzeń nie ma jeszcze żadnego wpisu!\nDodaj pierwsze życzenie do listy.',
        filtered:
            'Na twojej liście życzeń nie ma żadnego życzenia pasującego do włączonych filtrów!\nSpróbuj wyłączyć filtry.',
        filled: {
            before: '<b>Oto twoja lista życzeń:</b>',
            after: '❓<b>Co chcesz zrobić?</b>\n\n➕ Dodać nowe życzenie do listy.\n✏️ Edytować istniejące życzenie na liście.\n❌ Usunąć istniejące życzenie z listy.\n🧹 Wyczyścić listę życzeń.\n💌 Podzielić się swoimi życzeniami z innymi za pomocą linku.'
        },
        add: {
            title: '➕ Nowe życzenie',
            description:
                'Podaj nazwę nowego życzenia w następnej wiadomości.\nNie więcej niż {0} znaków!',
            error: '❌ To nie wygląda na dobrą nazwę!\nSpróbuj jeszcze raz.',
            success: '✅ Nowe życzenie zostało dodane do listy!'
        },
        edit: {
            description: '✏️ Menu edycji życzenia',
            actions: {
                title: '✏️ Zmień nazwę',
                addDescription: '✏️ Dodaj opis',
                updateDescription: '✏️ Zaktualizuj opis',
                addImages: '🌅 Dodaj zdjęcia',
                updateImages: '🌅 Zaktualizuj zdjęcia',
                addLink: '🔗 Dodaj link',
                updateLink: '🔗 Zaktualizuj link',
                setPriority: '❗️Bardzo tego chcę',
                unsetPriority: '❗Już nie tak bardzo tego chcę',
                hide: '🫣 Ukryj przed innymi',
                show: '👀 Przywróć widoczność',
                addPrice: '💸 Podaj cenę',
                updatePrice: '💸 Zaktualizuj cenę'
            },
            scenes: {
                title: '✏️ Podaj nową nazwę życzenia.\nNie więcej niż {0} znaków!',
                addDescription:
                    '✏️ Dodaj opis do bieżącego życzenia\nNie więcej niż {0} znaków!',
                updateDescription:
                    '✏️ Zmień opis (nie więcej niż {0} znaków) albo ❌ usuń go',
                addImages: '🌅 Dodaj nowe zdjęcia (maksymalnie 9)',
                updateImages:
                    '🌅 Dodaj nowe zdjęcia (maksymalnie 9) albo ❌ usuń wszystkie dodane',
                addLink: '🔗 Dodaj link',
                updateLink: '🔗 Zmień link albo ❌ usuń go',
                addPrice: '💸 Podaj cenę',
                updatePrice: '💸 Zaktualizuj cenę albo ❌ usuń ją'
            },
            errors: {
                title: {
                    general: '❌ Nieprawidłowa nazwa!',
                    link: '❌ Nazwa nie może zawierać linku!'
                },
                description: '❌ Nieprawidłowy opis!',
                removeImages: '❌ Brak zdjęć!',
                updateImages: '❌ W wiadomości nie ma zdjęć!',
                link: '❌ Link musi zawierać http!',
                price: '❌ Nieprawidłowa cena!'
            },
            success: {
                title: '✅ Nazwa została zaktualizowana!',
                removeDescription: '✅ Opis został usunięty!',
                updateDescription: '✅ Opis został zaktualizowany!',
                removeImages: '✅ Zdjęcia zostały usunięte!',
                updateImages: '✅ Zdjęcia zostały dodane!',
                removeLink: '✅ Link został usunięty!',
                updateLink: '✅ Link został zaktualizowany!',
                priority: '✅ Priorytet został zmieniony!',
                visibility: '✅ Widoczność została zmieniona!',
                removePrice: '✅ Cena została usunięta!',
                updatePrice: '✅ Cena została zmieniona!',
                imagesLimit:
                    'ℹ️ Zapisano tylko 9 zdjęć: więcej do jednego życzenia dodać nie można.'
            }
        },
        remove: {
            confirm:
                '❓Czy twoje życzenie się spełniło (tylko do statystyk, życzenie i tak zostanie usunięte)?',
            success: '✅ Życzenie zostało usunięte!'
        },
        clean: {
            error: '❌ Lista życzeń jest już pusta!',
            success: '✅ Lista życzeń została wyczyszczona!',
            confirm:
                '❓<b>Na pewno wyczyścić listę życzeń?</b>\n\nWszystkie życzenia zostaną usunięte, a także znikną z list <b>Chcę podarować</b> innych osób. Tego nie da się cofnąć.'
        },
        share: {
            success: '✅ Oto link do twojej listy życzeń:\n{url}',
            empty: '❌ Na razie nie ma czym się dzielić: lista życzeń jest pusta.\nNajpierw dodaj przynajmniej jedno życzenie.'
        }
    },
    giveList: {
        title: '🎁 Chcę podarować',
        empty: 'Na twojej liście <b>Chcę podarować</b> nie ma jeszcze żadnego wpisu!\n🔎 Znajdź listę życzeń innej osoby, żeby wybrać prezent.',
        filled: {
            before: '<b>Oto twoja lista tego, co chcesz podarować:</b>',
            after: '❓<b>Co chcesz zrobić?</b>\n\n❌ Usunąć istniejące życzenie z listy.\n🧹 Wyczyścić listę <b>Chcę podarować</b>'
        },
        givers: '\n\n👥 <i>Podarować to chcą też: {0}</i>',
        owner: '\n\n👤 Dla użytkownika: <b>{0}</b>',
        success: {
            remove: '✅ Życzenie zostało usunięte z listy <b>Chcę podarować</b>!',
            clean: '✅ Wszystkie życzenia zostały usunięte z listy <b>Chcę podarować</b>!'
        },
        clean: {
            confirm:
                '❓<b>Na pewno wyczyścić listę Chcę podarować?</b>\n\nWszystkie wybrane życzenia znikną z tej listy.'
        }
    },
    findList: {
        title: '🔎 Znajdź inną listę życzeń',
        description:
            'Spróbuj znaleźć osobę po nazwie użytkownika lub numerze telefonu.\n\nPowody, dla których osoby nie można znaleźć:\n1. Osoba nie korzystała z bota.\n2. Jeśli szukasz po numerze telefonu i masz pewność, że numer jest prawidłowy...\nMożliwe, że osoba, której szukasz, nie chciała udostępniać botowi swojego numeru.\nSpróbuj poszukać po nazwie użytkownika.\n\n<b>Wpisz nazwę użytkownika lub numer telefonu tej osoby w następnej wiadomości.</b>',
        empty: 'Ta osoba nie wypełniła jeszcze listy życzeń',
        filtered:
            'Na tej liście życzeń nie ma żadnego życzenia pasującego do włączonych filtrów!\nSpróbuj wyłączyć filtry.',
        filled: {
            before: 'Oto lista życzeń <b>{0}</b>:',
            payments:
                'Jeśli nie możesz podarować konkretnego prezentu, użytkownik podał swoje dane płatnicze, za pomocą których możesz przesłać pieniądze, żeby ta osoba mogła kupić prezent samodzielnie:\n\n{0}',
            after: '❓<b>Co chcesz zrobić?</b>\n\n🎁 Wybrać życzenie na prezent\n❌ Nie podarować wybranego życzenia'
        },
        givers: {
            you: '\n\n👥 <i>Chcesz to podarować</i>',
            somebodyAndYou:
                '\n\n👥 <i>Już chcą to podarować - ty i jeszcze: {0}</i>',
            somebody: '\n\n👥 <i>Już chcą to podarować: {0}</i>'
        },
        actions: {
            give: '🎁 Podaruję',
            take: '❌ Nie podaruję'
        },
        errors: {
            give: '❌ To życzenie jest już na liście <b>Chcę podarować</b>!',
            take: '❌ Tego życzenia nie ma na liście <b>Chcę podarować</b>!',
            notFound: '❌ Nie znaleziono osoby, spróbuj jeszcze raz!',
            foundYourself:
                '❌ Ach ty chytra szelmo, siebie szukać nie wolno! 😘',
            tooLong:
                '❌ To zapytanie jest za długie! Maksymalnie {0} znaków, spróbuj jeszcze raz.'
        },
        success: {
            give: '✅ Życzenie zostało dodane do listy <b>Chcę podarować</b>!',
            take: '✅ Życzenie zostało usunięte z listy <b>Chcę podarować</b>!'
        }
    },
    donate: {
        title: '💸 Wesprzyj autora darowizną 🥹👉👈',
        description:
            'Bot będzie darmowy tak długo, jak to możliwe, żebyśmy my - Ukraińcy - mogli sprawiać sobie nawzajem prezenty.\nTo bardzo ważne, to naprawdę potrzebne. Bo mamy tylko siebie nawzajem!\n\nAle jeśli chcesz wesprzeć autora, możesz to zrobić za pomocą serwisów wymienionych poniżej albo przez PayPal:\n{paypal}\n\nA ja będę ci szczerze wdzięczny ❤️\n\nWiększość darowizn trafia na zbiórki dla Sił Zbrojnych Ukrainy.\nZbiórki i rozliczenia znajdziesz na moim kanale na Telegramie pod linkiem poniżej.',
        services: {
            buymeacoffee: {
                title: '☕️ Buymeacoffee'
            },
            monobank: {
                title: '🫙 Monobank'
            }
        }
    },
    stats: {
        action: '📊 Statystyki',
        title: '📊 <b>Statystyki</b>',
        users: '👤 Aktywni użytkownicy: <b>{0}</b>',
        wishes: '🎁 Utworzono życzeń łącznie: <b>{0}</b>',
        done: '✅ Spełniono życzeń łącznie: <b>{0}</b>'
    },
    contacts: {
        telegram: '🔗 Kanał na Telegramie'
    },
    share: {
        title: 'Lista życzeń od {name}',
        payments:
            'Jeśli nie możesz podarować mi konkretnego prezentu, poniżej są moje dane płatnicze, za pomocą których można przesłać pieniądze, żeby prezent można było kupić samodzielnie:\n\n{0}'
    },
    markup: {
        title: '❤️ <b>{0}</b>',
        description: '\n\n✏️ Opis:\n{0}',
        priority: {
            owner: '\n\n<blockquote>❗️ <b>Bardzo tego teraz chcę!</b></blockquote>',
            watcher:
                '\n\n<blockquote>❗️ <b>Ta osoba bardzo tego teraz chce!</b></blockquote>'
        },
        hidden: '\n\n🫣 <i>To życzenie jest ukryte przed innymi!</i>',
        price: '\n\n💸 Orientacyjna cena: <b>{0}</b>',
        date: {
            created: '\n\n🗓 <i>Utworzono: {0}</i>',
            updated: '\n🗓 <i>Zaktualizowano: {0}</i>'
        }
    },
    payments: {
        title: {
            add: '💸 Podaj własne dane płatnicze',
            update: '💸 Zaktualizuj własne dane płatnicze'
        },
        description: {
            add: 'Tu możesz podać własne dane płatnicze na wypadek, gdyby inne osoby, które chcą podarować ci coś z twojej listy życzeń, nie mogły tego zrobić i chciały przesłać ci pieniądze na samodzielny zakup prezentów.\n\nPodawaj tylko takie dane, które chcesz pokazać innym użytkownikom, na przykład:\n- Słoik w Monobanku\n- Numer karty bankowej\n- Kontakt PayPal\n- Link do Buymeacoffee lub podobnych serwisów.{current}\n\n<b>Podaj nowe dane płatnicze w następnej wiadomości</b>.',
            update: '<b>Twoje aktualne dane płatnicze:</b>\n{0}'
        },
        edit: {
            error: '❌ To nie wygląda na prawidłowe dane!\nSpróbuj jeszcze raz.',
            success: '✅ Dane płatnicze zostały zaktualizowane!',
            tooLong:
                '❌ Dane płatnicze są za długie! Maksymalnie {0} znaków.\nSpróbuj jeszcze raz.'
        },
        remove: {
            success:
                '✅ Dane płatnicze zostały usunięte! Zawsze możesz tu wrócić, żeby dodać je ponownie!'
        }
    },
    filters: {
        title: '💰 Filtruj według ceny',
        description: 'Pokaż tylko te życzenia, które pasują do podanej ceny.',
        applied: '\n\nZastosowany filtr ceny:\n<b>{0}</b>',
        fromTo: 'Od {0} do {1}',
        from: 'Od {0}',
        to: 'Do {0}',
        reset: '❌ Zresetuj filtry',
        success: {
            reset: '✅ Filtry zostały zresetowane!',
            set: '✅ Filtr został ustawiony!'
        }
    },
    pagination: {
        range: 'Pokazano {0}-{1} z {2}'
    },
    releases: {
        labels: {
            added: 'Dodano',
            updated: 'Zmieniono',
            fixed: 'Naprawiono',
            removed: 'Usunięto',
            notes: 'Notatki'
        },
        announcement: {
            title: 'Bot został zaktualizowany do wersji {version} 🎉',
            footer: 'Wszystkie zmiany i poprzednie wersje: /releases'
        },
        empty: 'Na razie nie ma wpisów o aktualizacjach.'
    },
    commands: {
        start: 'Menu główne',
        lang: 'Zmień język bota',
        releases: 'Co nowego w bocie'
    }
};

export default pl;
