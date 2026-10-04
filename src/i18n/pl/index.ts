import type { Translation } from '../i18n-types';

const pl: Translation = {
    title: 'Lista życzeń ❤️',
    errors: {
        unknown: '🤷 Ups, coś poszło nie tak...',
        outdatedButton: 'Ten przycisk jest już nieaktualny. Oto menu główne 👇'
    },
    language: {
        title: '🇵🇱 PL | 🇺🇸 EN | 🇺🇦 UA',
        description:
            '🇵🇱 Zmień język interfejsu bota.\n🇺🇸 Change a language of the bot interface.\n🇺🇦 Змінити мову для інтерфейсу боту.\n\n🎲 Jeśli wybierzesz tryb automatyczny, język interfejsu bota będzie taki sam jak ustawiony w Telegramie.\n🎲 If you choose the auto mode, a language of bot interface will be the same as it set in Telegram preferences.\n🎲 Якщо обрати автоматичний режим, мова інтерфейсу боту буде така сама, як вказана в налаштуваннях Телеграму.',
        options: {
            uk: '🇺🇦 Ukraiński | Ukrainian | Українська',
            en: '🇺🇸 Angielski | English | Англійська',
            pl: '🇵🇱 Polski | Polish | Польська',
            auto: '🎲 Automatycznie | Auto | Автоматично'
        },
        names: {
            uk: 'ukraiński',
            en: 'angielski',
            pl: 'polski',
            auto: 'automatyczny'
        },
        success: '✅ Język interfejsu został zmieniony: {0}',
        current: 'Aktualny język: {0}',
        invalid: '❌ Nieznany język: {0}\nDostępne opcje: pl, en, uk, auto'
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
        language: '🌐',
        openApp: '📱 Otwórz aplikację'
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
                '<b>Dane prywatne</b>\n\nNumer telefonu to prywatna informacja każdego użytkownika!\nTe dane posłużą wyłącznie do wyszukiwania list życzeń innych użytkowników, jeśli znasz ich numer.\nBot ma otwarty kod (open source), który możesz obejrzeć pod linkiem do GitHuba.\nBaza użytkowników jest przechowywana w Cloudflare z solidną ochroną!\nBot zapisuje wyłącznie twoją nazwę użytkownika i/lub numer telefonu.\nŻadnych imion, żadnych nazwisk, dopóki sam(-a) nie udostępnisz listy życzeń: wtedy bot zapisze imię z twojego Telegrama, żeby pokazać je na publicznej stronie. Gdy wyłączysz udostępnianie, imię zostanie usunięte.\nNumer telefonu i adres dostawy, jeśli je włączysz, są pokazywane tylko w Telegramie i nigdy na stronie w przeglądarce.\nDzięki za zainteresowanie tak ważnym tematem ❤️',
            openSource:
                '\n\n<b>Otwarty kod (Open Source)</b>\n\nOtwarty kod oznacza, że każdy chętny może\n- włączyć się w ulepszanie projektu\n- zobaczyć, jak napisany jest kod\n- ponadto projekt ma licencję GNU AGPLv3, co oznacza, że kod można w pełni skopiować do dowolnego innego projektu, nawet komercyjnego.',
            languages:
                '\n\n<b>Języki</b>\n\nBot mówi po polsku, angielsku i ukraińsku.\nJęzyk możesz zmienić przyciskiem 🌐 lub poleceniem /lang, a w trybie automatycznym bot dopasuje się do języka twojego Telegrama.\nJeśli chcesz pomóc w tłumaczeniach na inne języki, zostaw swoje dane kontaktowe w opinii.',
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
        fromApp: '#opinia z aplikacji od {0}\n\n{1}',
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
            both: '\nBędzie można cię znaleźć\n👤 Po nazwie użytkownika: @{0}\n📱 I po numerze telefonu: {1}',
            app: '✅ Mamy twój numer! Wróć do aplikacji, wszystko jest już zaktualizowane.'
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
            success: '✅ Nowe życzenie zostało dodane do listy!',
            limit: '❌ Lista życzeń jest pełna: może zawierać do 500 życzeń.\nNajpierw usuń kilka z nich.'
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
                priority: '🎯 Priorytet: {level}',
                imagesOrder: '🔀 Kolejność zdjęć',
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
                updatePrice: '💸 Zaktualizuj cenę albo ❌ usuń ją',
                priceCurrency: 'Tylko liczba, w {0}.'
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
                priority: '✅ Priorytet został zaktualizowany!',
                visibility: '✅ Widoczność została zmieniona!',
                removePrice: '✅ Cena została usunięta!',
                updatePrice: '✅ Cena została zmieniona!',
                imagesLimit:
                    'ℹ️ Zapisano tylko 9 zdjęć: więcej do jednego życzenia dodać nie można.'
            },
            currency: {
                hint: 'Wybierz walutę tego życzenia. Teraz: {currency}.',
                success: '✅ Zmieniono walutę życzenia: {currency}'
            },
            images: {
                order: {
                    prompt: '🔀 Wybierz zdjęcie, które ma zostać zdjęciem głównym.',
                    caption: 'Zdjęcie {n}',
                    makeFirst: '⬆️ Ustaw zdjęcie {n} jako główne',
                    success: '✅ Kolejność zdjęć została zmieniona!',
                    changed:
                        'ℹ️ Zdjęcia w międzyczasie się zmieniły, więc kolejność nie została zapisana. Spróbuj jeszcze raz.'
                }
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
            empty: '❌ Na razie nie ma czym się dzielić: lista życzeń jest pusta.\nNajpierw dodaj przynajmniej jedno życzenie.',
            consent:
                '🌐 Zanim udostępnisz\n\nBot utworzy publiczną stronę twojej listy życzeń na {host}. Będą na niej:\n• imię z twojego profilu na Telegramie: {name}\n• twój @username, tylko jeśli sam(-a) go włączysz\n• wszystkie życzenia oprócz ukrytych, wraz z ich zdjęciami\n• twoje dane płatnicze, jeśli je dodałeś(-aś)\n\nStronę może otworzyć każdy, kto ma link, i może ona pojawić się w wynikach wyszukiwarek. Twój numer telefonu i lista „Chcę podarować” nigdy nie są tam pokazywane. Numer telefonu i adres dostawy, jeśli je włączysz, są pokazywane tylko w Telegramie, a na stronie w przeglądarce nigdy.\n\nUdostępnianie możesz wyłączyć w każdej chwili.',
            ready: '✅ Twoja lista życzeń jest gotowa!\n\n📲 Otwórz w Telegramie:\n{appUrl}\n\n🌐 Strona w przeglądarce:\n{pageUrl}\n\nStrona aktualizuje się sama po każdej zmianie na liście.',
            stopConfirm:
                '❓ Wyłączyć udostępnianie listy życzeń?\n\nStrona przestanie się otwierać, a zapisane imię zostanie usunięte. Jeśli później udostępnisz ją ponownie, zadziała ten sam link, więc każdy, kto go ma, znów zobaczy twoją listę.',
            stopped:
                '✅ Gotowe, twoja lista życzeń nie jest już udostępniana.\nStrona pod linkiem już się nie otwiera.',
            newConfirm:
                '❓ Utworzyć nowy link?\n\nStary link od razu przestanie działać i nikt nie otworzy już nim twojej listy. Nowy link trzeba będzie ponownie wysłać znajomym.',
            rotated:
                '✅ Oto nowe linki do twojej listy życzeń.\n\n📲 Otwórz w Telegramie:\n{appUrl}\n\n🌐 Strona w przeglądarce:\n{pageUrl}\n\nStare linki już nie działają.',
            pageEmpty:
                'ℹ️ Strona jest teraz pusta: nie ma na niej widocznych życzeń. Link działa, a życzenia pojawią się na stronie od razu po ich dodaniu.',
            sendText:
                'Moja lista życzeń ❤️ Wybierz dla mnie prezent 🎁\n\n🌐 Nie masz Telegrama? Otwórz w przeglądarce:\n{pageUrl}',
            actions: {
                publish: '✅ Udostępnij',
                openTelegram: '📲 Otwórz w Telegramie',
                openBrowser: '🌐 Strona w przeglądarce',
                send: '📤 Wyślij znajomym',
                stop: '🚫 Wyłącz udostępnianie',
                newLink: '🔄 Nowy link',
                showUsername: '👤 Pokazuj mój @username',
                hideUsername: '🙈 Nie pokazuj @username'
            }
        }
    },
    giveList: {
        title: '🎁 Chcę podarować',
        empty: 'Twoja lista <b>Chcę podarować</b> jest na razie pusta. Pojawią się tu życzenia, które zarezerwujesz.\n🔎 Znajdź listę życzeń innej osoby, żeby zarezerwować życzenie.',
        filled: {
            before: '<b>Oto życzenia, które rezerwujesz dla innych:</b>',
            after: '❓<b>Co chcesz zrobić?</b>\n\n❌ Anulować rezerwację życzenia.\n🧹 Wyczyścić listę <b>Chcę podarować</b>'
        },
        givers: '\n\n👥 <i>Zarezerwowane także przez: {0}</i>',
        owner: '\n\n👤 Dla użytkownika: <b>{0}</b>',
        success: {
            remove: '✅ Rezerwacja anulowana, życzenie usunięto z listy <b>Chcę podarować</b>!',
            clean: '✅ Wszystkie rezerwacje anulowane, lista <b>Chcę podarować</b> jest pusta!'
        },
        clean: {
            confirm:
                '❓<b>Na pewno wyczyścić listę Chcę podarować?</b>\n\nWszystkie twoje rezerwacje zostaną anulowane, a życzenia znikną z tej listy.'
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
            after: '❓<b>Co chcesz zrobić?</b>\n\n🎁 Zarezerwować życzenie\n❌ Anulować rezerwację życzenia',
            contact: {
                title: '📇 <b>Kontakt i dostawa</b>',
                phone: '📱 Telefon: {phone}',
                address: '📦 Adres dostawy:\n{address}'
            }
        },
        givers: {
            you: '\n\n👥 <i>Zarezerwowane przez ciebie</i>',
            somebodyAndYou:
                '\n\n👥 <i>Zarezerwowane przez ciebie i jeszcze: {0}</i>',
            somebody: '\n\n👥 <i>Zarezerwowane przez innych: {0}</i>'
        },
        actions: {
            give: '🎁 Zarezerwuj',
            take: '❌ Anuluj rezerwację'
        },
        errors: {
            give: '❌ To życzenie jest już przez ciebie zarezerwowane!',
            take: '❌ Tego życzenia nie ma wśród twoich rezerwacji!',
            notFound: '❌ Nie znaleziono osoby, spróbuj jeszcze raz!',
            foundYourself:
                '❌ Ach ty chytra szelmo, siebie szukać nie wolno! 😘',
            tooLong:
                '❌ To zapytanie jest za długie! Maksymalnie {0} znaków, spróbuj jeszcze raz.'
        },
        success: {
            give: '✅ Zarezerwowano! Życzenie trafiło na listę <b>Chcę podarować</b>.',
            take: '✅ Rezerwacja anulowana, życzenie usunięto z listy <b>Chcę podarować</b>.'
        }
    },
    donate: {
        title: '💸 Wesprzyj autora darowizną 🥹👉👈',
        description:
            'Bot będzie darmowy tak długo, jak to możliwe, żebyśmy my - Ukraińcy - mogli sprawiać sobie nawzajem prezenty.\nTo bardzo ważne, to naprawdę potrzebne. Bo mamy tylko siebie nawzajem!\n\nAle jeśli chcesz wesprzeć autora, możesz to zrobić za pomocą serwisów wymienionych poniżej albo bezpośrednio przez PayPal:\n{paypal}\n\nA ja będę ci szczerze wdzięczny ❤️\n\nWiększość darowizn trafia na zbiórki dla Sił Zbrojnych Ukrainy.\nZbiórki i rozliczenia znajdziesz na moim kanale na Telegramie pod linkiem poniżej.',
        services: {
            monobank: {
                title: '🫙 Monobank'
            },
            kofi: {
                title: '☕️ Ko-fi'
            },
            paypal: {
                title: '💳 PayPal'
            },
            revolut: {
                title: '💸 Revolut'
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
        title: 'Lista życzeń od {name}'
    },
    markup: {
        title: '❤️ <b>{0}</b>',
        description: '\n\n✏️ Opis:\n{0}',
        priority: {
            low: {
                owner: '\n\n<blockquote>🟢 <b>Trochę tego teraz chcę</b></blockquote>',
                watcher:
                    '\n\n<blockquote>🟢 <b>Ta osoba trochę tego teraz chce</b></blockquote>'
            },
            medium: {
                owner: '\n\n<blockquote>🟡 <b>Chcę tego teraz</b></blockquote>',
                watcher:
                    '\n\n<blockquote>🟡 <b>Ta osoba chce tego teraz</b></blockquote>'
            },
            high: {
                owner: '\n\n<blockquote>❗️ <b>Bardzo tego teraz chcę!</b></blockquote>',
                watcher:
                    '\n\n<blockquote>❗️ <b>Ta osoba bardzo tego teraz chce!</b></blockquote>'
            }
        },
        hidden: '\n\n🫣 <i>To życzenie jest ukryte przed innymi!</i>',
        price: '\n\n💸 Orientacyjna cena: <b>{0}</b>',
        approx: '≈ {0} ({1})',
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
    settings: {
        title: '⚙️ Ustawienia',
        description:
            'Wybierz, co chcesz ustawić: język, walutę, dane płatnicze, adres dostawy albo to, co widzą inni.'
    },
    currency: {
        title: '💱 Waluta',
        description:
            'Wybierz walutę, w której podajesz cenę nowych życzeń. Każde życzenie zachowuje własną walutę, a inni widzą kwoty orientacyjnie, przeliczone według kursu Narodowego Banku Ukrainy.\n\nAktualna waluta: <b>{current}</b>',
        options: {
            UAH: '🇺🇦 ₴ Hrywna',
            USD: '🇺🇸 $ Dolar amerykański',
            EUR: '🇪🇺 € Euro',
            PLN: '🇵🇱 zł Złoty'
        },
        success: '✅ Zmieniono walutę: {currency}'
    },
    priority: {
        title: '🎯 Priorytet',
        levels: {
            none: '⚪ Brak priorytetu',
            low: '🟢 Niski',
            medium: '🟡 Średni',
            high: '🔴 Wysoki'
        },
        success: '✅ Zmieniono priorytet: {level}'
    },
    delivery: {
        title: {
            add: '📦 Dodaj adres dostawy',
            update: '📦 Zaktualizuj adres dostawy'
        },
        description:
            'Napisz, dokąd wysyłać prezenty, na przykład do paczkomatu lub punktu odbioru. Od 5 do 300 znaków, maksymalnie 6 wierszy, bez linków.{current}\n\n<b>Wyślij nowy adres w następnej wiadomości</b>.',
        phoneWarning:
            'ℹ️ Adres jest pokazywany innym tylko razem z numerem telefonu. Możesz to włączyć w sekcji „Co widzą inni”.',
        errors: {
            tooShort:
                '❌ Za mało informacji: dodaj trochę więcej szczegółów.\nSpróbuj jeszcze raz.',
            tooLong:
                '❌ Adres jest za długi! Maksymalnie {max} znaków.\nSpróbuj jeszcze raz.',
            containsLink:
                '❌ Adres nie może zawierać linków.\nSpróbuj jeszcze raz.'
        },
        success: {
            update: '✅ Adres dostawy został zapisany!',
            remove: '✅ Adres dostawy został usunięty! Zawsze możesz tu wrócić, żeby dodać go ponownie!'
        }
    },
    disclosure: {
        title: '👀 Co widzą inni',
        description:
            'Wybierz, co zobaczą inni, gdy otworzą twoją listę życzeń. Numer telefonu i adres dostawy są pokazywane tylko w Telegramie i nigdy na stronie w przeglądarce. Domyślnie są wyłączone.',
        toggle: {
            payments: {
                on: '✅ Dane płatnicze: widoczne',
                off: '🚫 Dane płatnicze: ukryte'
            },
            phone: {
                on: '✅ Numer telefonu: widoczny',
                off: '🚫 Numer telefonu: ukryty'
            },
            address: {
                on: '✅ Adres dostawy: widoczny',
                off: '🚫 Adres dostawy: ukryty'
            }
        },
        confirm: {
            phone: '❓ Pokazywać twój numer telefonu?\n\nZobaczy go każdy, kto otworzy twoją listę życzeń w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Na stronie w przeglądarce numer nigdy nie jest pokazywany. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.',
            address:
                '❓ Pokazywać twój adres dostawy?\n\nZobaczy go każdy, kto otworzy twoją listę życzeń w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Adres jest pokazywany tylko razem z numerem telefonu i nigdy na stronie w przeglądarce. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.'
        },
        needsPhone:
            '❌ Najpierw włącz pokazywanie numeru telefonu: adres jest pokazywany tylko razem z nim.',
        needsAddress: '❌ Najpierw dodaj adres dostawy.',
        phoneMissing:
            '❌ Bot nie ma twojego numeru telefonu. Najpierw pozwól, żeby inni mogli cię znajdować po numerze, w sekcji „Zmień widoczność”.',
        saved: '✅ Ustawienia zostały zapisane!',
        indexing: {
            title: 'Pokazuj w wyszukiwarkach',
            hint: 'Gdy ta opcja jest włączona, Google i inne wyszukiwarki mogą pokazywać stronę twojej listy życzeń, w tym znajdujące się na niej dane płatnicze. Po wyłączeniu do strony zostanie dodany znacznik noindex, ale kopie, które już trafiły do indeksu, mogą znikać dopiero po pewnym czasie.',
            on: '✅ Wyszukiwarki: dozwolone',
            off: '🚫 Wyszukiwarki: zablokowane'
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
    web: {
        header: {
            count: '{count} {{count:|życzenie||życzenia|życzeń|życzenia}}',
            summary:
                '{count} {{count:|życzenie||życzenia|życzeń|życzenia}}, zaktualizowano {date}',
            username: 'Telegram: @{username}',
            lead: 'Lista życzeń od',
            fallback: 'Lista życzeń'
        },
        payments: {
            title: 'Można podarować pieniądze'
        },
        wish: {
            priority: {
                low: 'Trochę chce',
                medium: 'Chce',
                high: 'Bardzo chce'
            },
            price: 'Orientacyjna cena:',
            approx: '≈ {amount}',
            original: '(cena pierwotna {amount})',
            link: 'Otwórz na {host}',
            photo: 'Zdjęcie {index} z {total}',
            details: 'Szczegóły',
            created: 'Dodano {date}',
            updated: 'Dodano {created}, zaktualizowano {updated}'
        },
        empty: 'Na razie nic tu nie ma. Życzenia pojawią się, gdy tylko zostaną dodane do listy.',
        truncated: 'Pokazano pierwsze {limit} życzeń z listy.',
        ratesNote:
            'Ceny w innych walutach są orientacyjne, przeliczone na {currency} według kursu Narodowego Banku Ukrainy z {date}',
        footer: {
            cta: 'Utwórz własną listę życzeń',
            support: 'Wesprzyj autora',
            openSource: 'Otwarty kod na GitHubie',
            openInApp: 'Otwórz w Telegramie i zarezerwuj życzenie'
        },
        currency: {
            label: 'Waluta',
            auto: 'Automatycznie',
            UAH: '₴ Hrywna',
            USD: '$ Dolar amerykański',
            EUR: '€ Euro',
            PLN: 'zł Złoty'
        },
        delivery: {
            inTelegram: 'Szczegóły dostawy są dostępne w Telegramie',
            cta: 'Otwórz w Telegramie'
        },
        language: {
            label: 'Język'
        },
        theme: {
            label: 'Motyw',
            system: 'Jak w systemie',
            light: 'Jasny motyw',
            dark: 'Ciemny motyw'
        },
        notFound: {
            title: 'Nie znaleziono strony',
            description:
                'Ta lista życzeń nie istnieje albo link jest nieaktualny.',
            cta: 'Otwórz bota'
        },
        gone: {
            title: 'Ta lista życzeń nie jest już udostępniana',
            description:
                'Właściciel już nie udostępnia tej listy. Jeśli udostępni ją ponownie, link zadziała.'
        },
        meta: {
            description:
                '{name}: {count} {{count:|życzenie||życzenia|życzeń|życzenia}} na liście życzeń'
        },
        home: {
            title: 'Lista życzeń: bot w Telegramie na życzenia i pomysły na prezenty',
            description:
                'Zbieraj życzenia w bocie w Telegramie, udostępnij jeden link, a bliscy podarują Ci dokładnie to, czego chcesz. Za darmo, po polsku, ukraińsku i angielsku.',
            name: 'Lista życzeń',
            tagline:
                'Zapisuj życzenia w Telegramie, udostępnij link, a bliscy wybiorą prezent, którego naprawdę potrzebujesz.',
            cta: 'Otwórz {bot}',
            note: 'Za darmo. Wystarczy Telegram.',
            steps: {
                title: 'Jak to działa',
                create: {
                    title: 'Utwórz listę w bocie',
                    text: 'Dodaj życzenia z nazwą, opisem, maksymalnie 9 zdjęciami, ceną i linkiem do sklepu.'
                },
                share: {
                    title: 'Udostępnij link',
                    text: 'Bot utworzy publiczną stronę Twojej listy. Wyślij link znajomym albo pozwól im znaleźć Cię w bocie po nazwie użytkownika lub numerze telefonu.'
                },
                give: {
                    title: 'Znajomi rezerwują życzenie',
                    text: 'Klikają „Zarezerwuj” i życzenie trafia na ich listę „Chcę podarować”. Inni znajomi widzą, że jest już zarezerwowane, a Ty nie, więc niespodzianka pozostaje niespodzianką.'
                }
            },
            features: {
                title: 'Co potrafi bot',
                photos: {
                    title: 'Zdjęcia i linki',
                    text: 'Do 9 zdjęć na życzenie i link do sklepu, żeby nikt nie pomylił modelu ani koloru.'
                },
                prices: {
                    title: 'Ceny i filtry',
                    text: 'Podaj cenę, a znajomi zobaczą ją w swojej walucie i przefiltrują życzenia według swojego budżetu.'
                },
                priority: {
                    title: 'Priorytety',
                    text: 'Zaznacz, czego chcesz najbardziej: takie życzenia dostają serduszko.'
                },
                hidden: {
                    title: 'Ukryte życzenia',
                    text: 'Szkice i sprawy osobiste zostają przy Tobie: ukryte życzenia widzisz tylko Ty.'
                },
                page: {
                    title: 'Strona dla znajomych',
                    text: 'Wszystkie życzenia na jednej stronie, którą można otworzyć bez Telegrama. Aktualizuje się sama.'
                },
                search: {
                    title: 'Szukanie znajomych',
                    text: 'Znajduj listy innych po nazwie użytkownika lub numerze telefonu, jeśli na to pozwolili.'
                },
                languages: {
                    title: 'Trzy języki',
                    text: 'Polski, ukraiński i angielski albo automatycznie według języka Telegrama.'
                }
            },
            privacy: {
                title: 'Prywatność',
                phone: 'Numer telefonu nigdy nie jest publiczny: służy tylko do wyszukiwania.',
                name: 'Imię pojawia się na stronie dopiero po Twojej zgodzie i znika, gdy tylko przestajesz udostępniać.',
                openSource:
                    'Kod jest otwarty na licencji AGPL-3.0, więc każdy może sprawdzić, jak bot obchodzi się z danymi.'
            },
            links: {
                title: 'Więcej od autora',
                author: 'Autor na X',
                princess: 'Inny bot autora: Księżniczka dnia'
            }
        }
    },
    commands: {
        start: 'Menu główne',
        lang: 'Zmień język bota',
        releases: 'Co nowego w bocie',
        app: 'Otwórz aplikację'
    },
    appEntry: {
        text: '📱 Aplikacja „Lista życzeń” otwiera się bezpośrednio w Telegramie. Zrobisz w niej to samo co w czacie: dodasz życzenia ze zdjęciami, znajdziesz listy znajomych i zarezerwujesz życzenia.'
    },
    app: {
        common: {
            appName: 'Lista życzeń',
            loading: 'Wczytywanie…',
            retry: 'Spróbuj ponownie',
            cancel: 'Anuluj',
            save: 'Zapisz',
            saving: 'Zapisuję…',
            send: 'Wyślij',
            sending: 'Wysyłam…',
            remove: 'Usuń',
            close: 'Zamknij',
            back: 'Wstecz',
            done: 'Gotowe',
            confirm: 'Potwierdź',
            yes: 'Tak',
            no: 'Nie',
            open: 'Otwórz',
            copy: 'Kopiuj',
            copied: 'Skopiowano',
            showMore: 'Pokaż więcej',
            moreActions: 'Więcej działań',
            optional: 'Opcjonalnie',
            counter: '{count} z {max}',
            charactersLeft:
                'Zostało {count} {{count:|znak||znaki|znaków|znaku}}',
            limitReached: 'Osiągnięto limit znaków',
            notSet: 'Nie podano',
            on: 'Włączone',
            off: 'Wyłączone',
            newBadge: 'Nowe'
        },
        a11y: {
            priority: {
                low: 'Trochę chcę',
                medium: 'Chcę',
                high: 'Bardzo chcę'
            },
            priorityThird: 'Bardzo chce',
            hidden: 'Ukryte życzenie, widzisz je tylko ty',
            photo: 'Zdjęcie {index} z {total}: {title}',
            photoPlaceholder: 'Brak zdjęcia',
            menu: 'Menu',
            closeToast: 'Zamknij komunikat',
            mainNavigation: 'Główna nawigacja',
            externalLink: 'Otworzy się w przeglądarce'
        },
        toasts: {
            saved: 'Zapisano',
            removed: 'Usunięto',
            copied: 'Skopiowano',
            undoUnavailable: 'Tej czynności nie można cofnąć'
        },
        errors: {
            generic: 'Coś poszło nie tak. Spróbuj ponownie.',
            network:
                'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.',
            unauthorized: 'Sesja wygasła. Otwórz aplikację jeszcze raz.',
            forbidden: 'Tej czynności nie można wykonać.',
            previewAccessDenied:
                'Ta wersja testowa jest dostępna tylko dla autora.',
            registrationRequired:
                'Najpierw wybierz, jak inni mają cię znajdować, a potem spróbuj ponownie.',
            tokenInvalid:
                'Dostęp do tej listy jest już nieważny. Znajdź tę osobę ponownie.',
            tokenExpired:
                'Dostęp do tej listy wygasł. Znajdź tę osobę ponownie.',
            notFound: 'To życzenie już nie istnieje.',
            listUnavailable: 'Ta lista życzeń jest teraz niedostępna.',
            shareGone: 'Ta lista życzeń nie jest już udostępniana.',
            conflict: 'Dane się zmieniły. Odśwież ekran i spróbuj ponownie.',
            shareEmpty:
                'Na razie nie ma czego udostępnić: dodaj choć jedno życzenie widoczne dla innych.',
            notShared: 'Obecnie nie udostępniasz swojej listy życzeń.',
            imagesFull: 'Do jednego życzenia można dodać najwyżej 9 zdjęć.',
            wishLimit:
                'Lista życzeń jest pełna: może zawierać do 500 życzeń. Najpierw usuń kilka z nich.',
            imageChanged:
                'Zdjęcia już się zmieniły. Odśwież ekran i spróbuj ponownie.',
            ownWish: 'Nie można zarezerwować własnego życzenia.',
            writeAccessRequired:
                'Pozwól botowi pisać do ciebie, aby mógł zapisywać zdjęcia.',
            payloadTooLarge: 'Plik jest za duży. Wybierz mniejszy.',
            unsupportedMedia:
                'Ten format nie jest obsługiwany. Wybierz zdjęcie JPEG, PNG lub WebP.',
            validation: 'Popraw zaznaczone pola.',
            rateLimited:
                'Za dużo działań w krótkim czasie. Spróbuj ponownie za {seconds} {{seconds:|sekundę||sekundy|sekund|sekundy}}.',
            upstream: 'Telegram teraz nie odpowiada. Spróbuj za chwilę.',
            notDelivered: 'Nie udało się wysłać opinii. Spróbuj za chwilę.',
            disabled: 'Aplikacja jest chwilowo niedostępna.',
            internal: 'Coś zepsuło się po naszej stronie. Spróbuj ponownie.',
            notImplemented: 'Ta funkcja jest jeszcze w przygotowaniu.'
        },
        fieldErrors: {
            required: 'To pole jest wymagane.',
            empty: 'To pole nie może być puste.',
            tooLong: 'Za dużo znaków: maksymalnie {max}.',
            tooShort: 'Za mało informacji: dodaj trochę więcej szczegółów.',
            containsLink:
                'Nazwa nie może zawierać linku. Dodaj go w polu „Link”.',
            invalid: 'Nieprawidłowa wartość.',
            usernameRequired:
                'Nie masz nazwy użytkownika w Telegramie. Dodaj ją w ustawieniach Telegrama i wróć.',
            usernameUnavailable:
                'Nazwę użytkownika można pokazać tylko wtedy, gdy inni mogą cię po niej znaleźć.',
            phoneRequired:
                'Potrzebny jest numer telefonu: pozwól, żeby inni mogli cię po nim znajdować, w sekcji „Widoczność”.',
            addressRequired: 'Potrzebny jest adres dostawy. Najpierw go dodaj.'
        },
        outside: {
            title: 'Otwórz w Telegramie',
            text: 'Ta aplikacja działa wewnątrz Telegrama. Otwórz ją przez bota, aby zobaczyć swoją listę życzeń.',
            cta: 'Otwórz w Telegramie'
        },
        expired: {
            title: 'Sesja wygasła',
            text: 'Aplikacja była otwarta zbyt długo. Zamknij ją i otwórz ponownie.',
            cta: 'Zamknij aplikację'
        },
        unavailable: {
            title: 'Aplikacja jest chwilowo niedostępna',
            text: 'Już nad tym pracujemy. Tymczasem wszystko możesz zrobić w czacie z botem.',
            cta: 'Otwórz bota'
        },
        previewOnly: {
            title: 'Wersja testowa',
            text: 'Ta wersja aplikacji jest dostępna tylko dla autora. Skorzystaj z głównego bota.',
            cta: 'Otwórz bota'
        },
        unsupported: {
            title: 'Zaktualizuj Telegrama',
            text: 'Twoja wersja Telegrama nie obsługuje tej aplikacji. Zaktualizuj Telegrama albo korzystaj z bota w czacie.',
            cta: 'Otwórz bota'
        },
        bootError: {
            title: 'Nie udało się uruchomić aplikacji',
            text: 'Spróbuj otworzyć ją ponownie. Jeśli to nie pomoże, bot w czacie działa jak zwykle.',
            cta: 'Spróbuj ponownie'
        },
        offline: {
            text: 'Brak połączenia. Widzisz ostatnio wczytane dane.',
            cta: 'Spróbuj ponownie'
        },
        nav: {
            home: 'Start',
            wishes: 'Moje życzenia',
            gives: 'Chcę podarować',
            find: 'Znajdź listę',
            share: 'Udostępnij',
            settings: 'Ustawienia',
            visibility: 'Widoczność',
            payments: 'Dane płatnicze',
            language: 'Język',
            feedback: 'Opinia',
            stats: 'Statystyki',
            donate: 'Wesprzyj autora',
            releases: 'Co nowego',
            about: 'O aplikacji',
            currency: 'Waluta',
            delivery: 'Adres dostawy'
        },
        contact: {
            title: 'Dane kontaktowe',
            phone: 'Telefon',
            address: 'Adres dostawy',
            copy: 'Kopiuj',
            copied: 'Skopiowano',
            call: 'Zadzwoń'
        },
        currency: {
            title: 'Waluta',
            lead: 'Wybierz walutę, w której podajesz cenę nowych życzeń. Każde życzenie zachowuje własną walutę, a inni widzą kwoty orientacyjnie, według kursu Narodowego Banku Ukrainy.',
            options: {
                UAH: {
                    title: 'Hrywna (₴)',
                    hint: 'Kod waluty: UAH'
                },
                USD: {
                    title: 'Dolar amerykański ($)',
                    hint: 'Kod waluty: USD'
                },
                EUR: {
                    title: 'Euro (€)',
                    hint: 'Kod waluty: EUR'
                },
                PLN: {
                    title: 'Złoty (zł)',
                    hint: 'Kod waluty: PLN'
                }
            }
        },
        delivery: {
            title: 'Adres dostawy',
            lead: 'Dokąd wysyłać prezenty, na przykład do paczkomatu lub punktu odbioru. Inni zobaczą adres tylko w Telegramie i tylko jeśli to włączysz.',
            label: 'Adres dostawy',
            placeholder: 'Na przykład paczkomat, Warszawa, ul. Marszałkowska 1',
            hint: 'Od 5 do 300 znaków, maksymalnie 6 wierszy, bez linków.',
            phoneWarning:
                'Adres jest pokazywany tylko razem z numerem telefonu. Możesz to włączyć w sekcji „Udostępnij listę”.',
            save: 'Zapisz',
            remove: 'Usuń adres',
            saved: 'Zapisano adres',
            removed: 'Usunięto adres'
        },
        home: {
            title: 'Lista życzeń',
            heroTitle: 'Twoja lista życzeń',
            wishesCount:
                '{count} {{count:|życzenie||życzenia|życzeń|życzenia}}',
            givesCount:
                '{count} {{count:|prezent||prezenty|prezentów|prezentu}} w planach',
            addWish: 'Dodaj życzenie',
            themeToggle: 'Motyw: {current}. Zmień',
            pairs: {
                stats: 'Statystyki',
                donate: 'Wesprzyj',
                feedback: 'Opinia',
                releases: 'Co nowego',
                about: 'O aplikacji'
            },
            tiles: {
                wishes: {
                    title: 'Moje życzenia',
                    text: 'Dodawaj i edytuj swoje życzenia'
                },
                gives: {
                    title: 'Chcę podarować',
                    text: 'Życzenia, które rezerwujesz dla innych'
                },
                find: {
                    title: 'Znajdź listę',
                    text: 'Po nazwie użytkownika lub numerze telefonu'
                },
                share: {
                    title: 'Udostępnij',
                    text: 'Publiczna strona twojej listy'
                }
            },
            groups: {
                settings: 'Ustawienia',
                about: 'O projekcie'
            },
            guest: {
                title: 'Witaj w Liście życzeń',
                lead: 'Zapisuj życzenia, udostępniaj link, a bliscy wybiorą prezent, którego naprawdę potrzebujesz.',
                stepsTitle: 'Jak to działa',
                steps: {
                    create: {
                        title: 'Stwórz listę',
                        text: 'Dodaj życzenia: nazwę, opis, do 9 zdjęć, cenę i link do sklepu.'
                    },
                    share: {
                        title: 'Udostępnij link',
                        text: 'Wyślij znajomym link do swojej strony albo pozwól znajdować się po nazwie użytkownika lub numerze.'
                    },
                    give: {
                        title: 'Znajomi rezerwują życzenie',
                        text: 'Znajomi widzą, które życzenia są już zarezerwowane. Ty nie, więc niespodzianka zostaje niespodzianką.'
                    }
                },
                cta: 'Zaczynamy',
                note: 'Aby stworzyć listę, wybierz, jak inni mają cię znajdować. To zajmie minutę.'
            }
        },
        wishes: {
            title: 'Moje życzenia',
            count: '{count} {{count:|życzenie||życzenia|życzeń|życzenia}}',
            add: 'Dodaj życzenie',
            empty: {
                title: 'Na razie pusto',
                text: 'Dodaj pierwsze życzenie, a pojawi się tutaj.',
                cta: 'Dodaj życzenie'
            },
            filteredEmpty: {
                title: 'Nic nie znaleziono',
                text: 'Żadne życzenie nie pasuje do tego filtra.',
                cta: 'Wyczyść filtr'
            },
            hiddenBadge: 'Widzisz tylko ty',
            priorityToggle: 'Wysoki priorytet',
            hiddenToggle: 'Ukryj przed innymi',
            photoCount: 'Zdjęcia: {count}',
            edit: 'Edytuj',
            menu: {
                share: 'Udostępnij listę',
                clean: 'Wyczyść listę'
            },
            clean: {
                title: 'Wyczyścić listę życzeń?',
                text: 'Wszystkie życzenia zostaną usunięte i znikną z list „Chcę podarować” innych osób. Tego nie można cofnąć.',
                confirm: 'Wyczyść',
                success: 'Lista życzeń wyczyszczona',
                empty: 'Lista życzeń jest już pusta'
            },
            toasts: {
                priorityOn: 'Ustawiono wysoki priorytet',
                priorityOff: 'Zdjęto priorytet',
                hidden: 'Teraz to życzenie widzisz tylko ty',
                shown: 'Teraz to życzenie widzą inni'
            }
        },
        money: {
            approx: '≈ {amount}',
            original: '(cena pierwotna {amount})'
        },
        filters: {
            title: 'Filtr według ceny',
            all: 'Wszystkie',
            upTo: 'Do {amount}',
            from: 'Od {amount}',
            range: 'Od {from} do {to}',
            reset: 'Wyczyść filtr',
            applied: 'Filtr: {label}'
        },
        editor: {
            createTitle: 'Nowe życzenie',
            editTitle: 'Edycja życzenia',
            requiredMark: 'wymagane',
            titleMissing: 'Dodaj nazwę życzenia',
            fixFields: 'Popraw zaznaczone pola: {count}',
            title: {
                label: 'Nazwa',
                hint: 'Krótko, czego dokładnie chcesz.',
                placeholder: 'Na przykład gra planszowa Carcassonne'
            },
            description: {
                label: 'Opis',
                hint: 'Rozmiar, kolor, model: wszystko, co pomoże się nie pomylić.',
                placeholder: 'Szczegóły, które warto znać'
            },
            price: {
                label: 'Orientacyjna cena',
                hint: 'Tylko liczba, w {currency}.',
                placeholder: '1500'
            },
            link: {
                label: 'Link',
                hint: 'Link do sklepu zaczynający się od https://',
                placeholder: 'https://',
                host: 'Otworzy się na {host}'
            },
            priority: {
                label: 'Priorytet',
                hint: 'Im wyższy priorytet, tym wyżej życzenie na liście. Serduszko dostają tylko życzenia z wysokim priorytetem.',
                levels: {
                    none: 'Brak',
                    low: 'Niski',
                    medium: 'Średni',
                    high: 'Wysoki'
                }
            },
            currency: {
                label: 'Waluta'
            },
            hidden: {
                label: 'Ukryj przed innymi',
                hint: 'Ukryte życzenie widzisz tylko ty.'
            },
            errors: {
                titleEmpty: 'Podaj nazwę życzenia.',
                titleTooLong: 'Nazwa jest za długa: maksymalnie {max} znaków.',
                titleContainsLink:
                    'Nazwa nie może zawierać linku. Dodaj go w polu „Link”.',
                descriptionTooLong:
                    'Opis jest za długi: maksymalnie {max} znaków.',
                priceInvalid: 'Podaj cenę jako liczbę, na przykład 1500.',
                linkInvalid: 'Link musi zaczynać się od http:// lub https://.'
            },
            create: 'Dodaj życzenie',
            save: 'Zapisz',
            created: 'Dodano życzenie',
            saved: 'Zapisano zmiany',
            createdAt: 'Dodano {date}',
            updatedAt: 'Zaktualizowano {date}',
            remove: {
                action: 'Usuń życzenie',
                title: 'Czy życzenie się spełniło?',
                text: 'To tylko do statystyk: życzenie i tak zostanie usunięte.',
                done: 'Tak, spełniło się',
                notDone: 'Po prostu usuń',
                success: 'Usunięto życzenie'
            },
            discard: {
                title: 'Odrzucić zmiany?',
                text: 'Niezapisane zmiany zostaną utracone.',
                confirm: 'Odrzuć zmiany',
                keep: 'Edytuj dalej'
            }
        },
        photos: {
            title: 'Zdjęcia',
            hint: 'Do {max} zdjęć. Pierwsze będzie okładką.',
            count: '{count} z {max}',
            add: 'Dodaj zdjęcia',
            remove: 'Usuń zdjęcie',
            removeAll: 'Usuń wszystkie zdjęcia',
            removeAllConfirm: {
                title: 'Usunąć wszystkie zdjęcia?',
                text: 'Wszystkie zdjęcia tego życzenia zostaną usunięte.',
                confirm: 'Usuń wszystkie'
            },
            uploading: 'Przesyłam zdjęcia…',
            progress: 'Przesłano {done} z {total}',
            uploaded: 'Dodano zdjęcie',
            duplicate: 'To zdjęcie już jest',
            failed: 'Nie udało się przesłać zdjęcia',
            full: 'Nie można dodać więcej niż {max} zdjęć',
            tooLarge: 'Zdjęcie jest za duże',
            unsupported: 'Ten format nie jest obsługiwany',
            queued: 'Zdjęcia prześlą się po zapisaniu',
            removed: 'Usunięto zdjęcie',
            reorder: {
                handle: 'Przeciągnij zdjęcie, aby zmienić kolejność',
                makeFirst: 'Ustaw jako główne',
                instructions:
                    'Przytrzymaj zdjęcie i przeciągnij je, aby zmienić kolejność. Pierwsze zdjęcie będzie zdjęciem głównym.',
                moved: 'Zdjęcie {position} z {total}',
                saved: 'Zapisano kolejność zdjęć',
                conflict:
                    'Zdjęcia już się zmieniły. Odśwież ekran i spróbuj ponownie.'
            },
            chatFallback: {
                action: 'Dodaj zdjęcia w czacie',
                hint: 'Jeśli zdjęcia nie dodają się tutaj, wyślij je botowi w czacie.',
                sent: 'Bot czeka na zdjęcia w czacie'
            },
            writeAccess: {
                title: 'Potrzebna zgoda',
                text: 'Aby zapisać zdjęcia, bot wysyła je do ciebie w czacie. Pozwól botowi pisać do ciebie.',
                allow: 'Pozwól'
            }
        },
        gives: {
            title: 'Chcę podarować',
            count: '{count} {{count:|prezent||prezenty|prezentów|prezentu}}',
            empty: {
                title: 'Lista jest pusta',
                text: 'Pojawią się tu życzenia, które zarezerwujesz. Znajdź listę życzeń znajomego i wybierz, co podarować.',
                cta: 'Znajdź listę'
            },
            owner: 'Dla {owner}',
            others: 'Zarezerwowane także przez: {count}',
            open: 'Otwórz',
            remove: 'Anuluj rezerwację',
            removed: 'Rezerwacja anulowana',
            clean: {
                action: 'Wyczyść listę',
                title: 'Wyczyścić listę „Chcę podarować”?',
                text: 'Wszystkie twoje rezerwacje zostaną anulowane, a życzenia znikną z tej listy.',
                confirm: 'Wyczyść',
                success: 'Lista wyczyszczona'
            }
        },
        find: {
            title: 'Znajdź listę życzeń',
            label: 'Nazwa użytkownika lub numer telefonu',
            placeholder: '@username lub +48…',
            hint: 'Możesz znaleźć osobę, która korzysta z bota i pozwala się znajdować.',
            submit: 'Znajdź',
            searching: 'Szukam…',
            errors: {
                empty: 'Wpisz nazwę użytkownika lub numer telefonu.',
                notFound:
                    'Nie znaleziono nikogo. Sprawdź nazwę użytkownika lub numer.',
                self: 'To przecież twoja lista 😉 Jest w sekcji Moje życzenia.',
                tooLong: 'Zapytanie jest za długie: maksymalnie {max} znaków.'
            },
            reasons: {
                title: 'Dlaczego kogoś może nie być w wynikach',
                notUser: 'Ta osoba jeszcze nie korzystała z bota.',
                phoneHidden:
                    'Ta osoba nie udostępniła botowi numeru telefonu. Spróbuj wyszukać po nazwie użytkownika.'
            }
        },
        third: {
            title: 'Lista życzeń',
            lead: 'Lista życzeń: {label}',
            count: '{count} {{count:|życzenie||życzenia|życzeń|życzenia}}',
            empty: 'Ta osoba jeszcze nie uzupełniła listy życzeń.',
            filteredEmpty: 'Żadne życzenie nie pasuje do tego filtra.',
            priority: 'Bardzo chce',
            openLink: 'Otwórz na {host}',
            givers: {
                you: 'Zarezerwowane przez ciebie',
                somebodyAndYou:
                    'Zarezerwowane przez ciebie i jeszcze {count} {{count:|osobę||osoby|osób|osoby}}',
                somebody:
                    'Zarezerwowane przez {count} {{count:|osobę||osoby|osób|osoby}}'
            },
            give: 'Zarezerwuj',
            take: 'Anuluj rezerwację',
            given: 'Zarezerwowano',
            taken: 'Rezerwacja anulowana',
            viewOnly:
                'Tę listę możesz tylko przeglądać. Aby zarezerwować życzenie, znajdź tę osobę po nazwie użytkownika lub numerze.',
            searchAgain: 'Znajdź ponownie',
            payments: {
                title: 'Można podarować pieniądze',
                text: 'Jeśli nie da się kupić konkretnego prezentu, możesz przelać pieniądze na te dane, a ta osoba kupi go sama.'
            }
        },
        share: {
            title: 'Udostępnij listę',
            empty: {
                title: 'Na razie nie ma czego udostępnić',
                text: 'Na stronie widać tylko życzenia, które widzą inni. Dodaj choć jedno takie.',
                cta: 'Dodaj życzenie'
            },
            consent: {
                title: 'Zanim udostępnisz',
                lead: 'Bot utworzy publiczną stronę twojej listy życzeń na {host}. Będzie na niej:',
                name: 'imię z twojego Telegrama: {name}',
                username: 'twój @username, tylko jeśli go włączysz',
                wishes: 'wszystkie życzenia poza ukrytymi, wraz z ich zdjęciami',
                payments:
                    'twoje dane płatnicze, jeśli są dodane (numer telefonu i adres dostawy nie są tam pokazywane, nawet jeśli je włączysz)',
                public: 'Stronę otworzy każdy, kto ma link, i może ona pojawić się w wynikach wyszukiwarek.',
                private:
                    'Numer telefonu i lista „Chcę podarować” nigdy tam nie są pokazywane.',
                stop: 'Udostępnianie możesz zakończyć w każdej chwili.'
            },
            details: {
                title: 'Co widzą inni',
                lead: 'Wybierz, co zobaczą osoby, które otworzą twoją listę w Telegramie. Numer telefonu i adres dostawy nigdy nie są pokazywane na stronie w przeglądarce.',
                payments: {
                    label: 'Dane płatnicze',
                    hint: 'Osoby, które otworzą listę, zobaczą, jak mogą przesłać ci pieniądze.'
                },
                phone: {
                    label: 'Numer telefonu',
                    hint: 'Tylko w Telegramie, nigdy na stronie w przeglądarce.'
                },
                address: {
                    label: 'Adres dostawy',
                    hint: 'Tylko w Telegramie i tylko razem z numerem telefonu.'
                },
                confirm: {
                    phone: 'Twój numer telefonu zobaczy każdy, kto otworzy twoją listę w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Na stronie w przeglądarce nigdy nie jest pokazywany. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.',
                    address:
                        'Twój adres dostawy zobaczy każdy, kto otworzy twoją listę w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Adres jest pokazywany tylko razem z numerem telefonu i nigdy na stronie w przeglądarce. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.'
                },
                phoneMissing:
                    'Najpierw pozwól, żeby inni mogli cię znajdować po numerze, w sekcji „Widoczność”.',
                addressMissing: 'Najpierw dodaj adres dostawy.',
                needsPhone:
                    'Adres można pokazywać tylko razem z numerem telefonu.'
            },
            indexing: {
                title: 'Pokazuj w wyszukiwarkach',
                hint: 'Gdy ta opcja jest włączona, Google i inne wyszukiwarki mogą pokazywać stronę twojej listy życzeń, w tym znajdujące się na niej dane płatnicze. Po wyłączeniu do strony zostanie dodany znacznik noindex, ale kopie, które już trafiły do indeksu, mogą znikać dopiero po pewnym czasie.'
            },
            publish: 'Udostępnij',
            published: 'Teraz udostępniasz swoją listę życzeń',
            link: {
                title: 'Twój link',
                copy: 'Kopiuj',
                copied: 'Skopiowano link',
                send: 'Wyślij znajomym',
                open: 'Otwórz stronę',
                appTitle: 'Link do Telegrama',
                openApp: 'Otwórz w Telegramie',
                appHint:
                    'Otwiera twoją listę bezpośrednio w Telegramie, gdzie znajomi od razu zarezerwują życzenie.',
                webTitle: 'Strona w przeglądarce',
                webHint: 'Dla osób, które nie korzystają z Telegrama.'
            },
            sendText: 'Moja lista życzeń ❤️ Wybierz dla mnie prezent 🎁',
            sendBrowserHint: '🌐 Nie masz Telegrama? Otwórz w przeglądarce:',
            autoUpdate:
                'Strona aktualizuje się sama po każdej zmianie na liście.',
            pageEmpty:
                'Strona jest teraz pusta: nie ma na niej widocznych życzeń. Pojawią się, gdy tylko je dodasz.',
            username: {
                label: 'Pokazuj mój @username',
                hint: 'Znajomi będą mogli napisać do ciebie w Telegramie.',
                shown: 'Twój @username jest teraz na stronie',
                hidden: 'Twojego @username nie ma już na stronie'
            },
            rotate: {
                action: 'Nowy link',
                title: 'Utworzyć nowy link?',
                text: 'Stary link od razu przestanie działać. Nowy trzeba będzie wysłać znajomym jeszcze raz.',
                confirm: 'Utwórz',
                success: 'Nowy link jest gotowy, stary już nie działa'
            },
            stop: {
                action: 'Zakończ udostępnianie',
                title: 'Zakończyć udostępnianie?',
                text: 'Strona przestanie się otwierać, a zapisane imię zostanie usunięte. Jeśli udostępnisz ją ponownie, zadziała ten sam link.',
                confirm: 'Zakończ',
                success: 'Nie udostępniasz już swojej listy życzeń'
            }
        },
        payments: {
            title: 'Dane płatnicze',
            lead: 'Jeśli ktoś chce podarować ci coś z listy, ale nie może tego kupić, przeleje pieniądze na te dane.',
            label: 'Dane płatnicze',
            hint: 'Skarbonka, numer karty, PayPal albo link do serwisu napiwków. Podaj tylko to, co chcesz pokazać innym.',
            placeholder: 'Na przykład link do skarbonki',
            preview: 'Tak zobaczą je inni',
            empty: 'Nie podano jeszcze danych płatniczych.',
            save: 'Zapisz',
            saved: 'Zapisano dane płatnicze',
            errors: {
                tooShort: 'Za mało informacji: dodaj trochę więcej szczegółów.',
                tooLong: 'Za dużo znaków: maksymalnie {max}.'
            },
            remove: {
                action: 'Usuń dane płatnicze',
                title: 'Usunąć dane płatnicze?',
                text: 'Inni nie zobaczą ich już na twojej liście.',
                confirm: 'Usuń',
                success: 'Usunięto dane płatnicze'
            }
        },
        visibility: {
            title: 'Widoczność',
            guestTitle: 'Rejestracja',
            lead: 'Jak inni mają cię znajdować?',
            later: 'Wybór możesz zmienić w każdej chwili.',
            current: 'Teraz można cię znaleźć',
            currentNone: 'Teraz nikt nie może cię znaleźć.',
            options: {
                username: {
                    title: 'Tylko po nazwie użytkownika',
                    hint: 'Jeśli zmienisz nazwę użytkownika w Telegramie, zaktualizuje się tu sama.'
                },
                phone: {
                    title: 'Tylko po numerze telefonu',
                    hint: 'Nikt nie zobaczy twojego numeru: służy tylko do wyszukiwania.'
                },
                both: {
                    title: 'Po nazwie użytkownika i numerze',
                    hint: 'Można cię znaleźć na oba sposoby.'
                }
            },
            values: {
                username: 'Po nazwie użytkownika',
                phone: 'Po numerze telefonu',
                both: 'Po nazwie użytkownika i numerze'
            },
            usernameMissing:
                'Nie masz nazwy użytkownika w Telegramie. Dodaj ją w ustawieniach Telegrama, aby inni mogli cię po niej znaleźć.',
            yourUsername: 'Twoja nazwa użytkownika: @{username}',
            yourPhone: 'Twój numer: {phone}',
            save: 'Zapisz',
            shareNumber: 'Udostępnij numer',
            phoneHint:
                'Telegram poprosi o potwierdzenie, że udostępniasz botowi swój numer. Nie trzeba go wpisywać.',
            waiting: 'Czekam na numer…',
            cancelled: 'Numer nie został wysłany',
            timeout: 'Numer nie dotarł. Spróbuj ponownie.',
            success: {
                guest: 'Gotowe! Teraz można cię znaleźć',
                user: 'Zaktualizowano widoczność'
            }
        },
        language: {
            title: 'Język',
            lead: 'Wybierz język aplikacji. Bot w czacie też będzie go używać.',
            names: {
                uk: 'Ukraiński',
                en: 'Angielski',
                pl: 'Polski'
            },
            native: {
                uk: 'Українська',
                en: 'English',
                pl: 'Polski'
            },
            auto: 'Automatycznie',
            autoHint: 'Jak w Telegramie: {language}',
            saved: 'Zmieniono język'
        },
        feedback: {
            title: 'Opinia',
            lead: 'Napisz wszystko, co myślisz: co ci się podoba, co się zepsuło, co poprawić, albo zaproponuj pomoc przy tłumaczeniu.',
            contactHint:
                'Jeśli czekasz na odpowiedź, zostaw kontakt: nazwę użytkownika, numer lub e-mail.',
            label: 'Wiadomość',
            placeholder: 'Twoja opinia',
            send: 'Wyślij',
            errors: {
                empty: 'Napisz choć kilka słów.',
                tooLong: 'Opinia jest za długa: maksymalnie {max} znaków.'
            },
            success: {
                title: 'Dziękuję za opinię!',
                text: 'Przeczytam ją najszybciej, jak się da.',
                another: 'Napisz jeszcze'
            }
        },
        stats: {
            title: 'Statystyki',
            users: 'Aktywni użytkownicy',
            wishes: 'Utworzono życzeń łącznie',
            done: 'Spełniono życzeń łącznie'
        },
        donate: {
            title: 'Wesprzyj autora',
            lead: 'Bot pozostanie darmowy tak długo, jak to możliwe, abyśmy mogli dawać sobie prezenty. Jeśli chcesz wesprzeć autora, wybierz wygodny serwis.',
            note: 'Większość darowizn trafia na zbiórki dla Sił Zbrojnych Ukrainy. Zbiórki i raporty są na kanale autora w Telegramie.',
            services: 'Serwisy',
            channel: 'Kanał autora w Telegramie',
            thanks: 'Serdecznie dziękuję ❤️'
        },
        releases: {
            title: 'Co nowego',
            version: 'Wersja {version}',
            date: 'Wydano {date}',
            empty: 'Na razie nie ma informacji o aktualizacjach.',
            showMore: 'Wcześniejsze wersje'
        },
        about: {
            title: 'O aplikacji',
            lead: 'Lista życzeń pomaga zbierać życzenia i wybierać prezenty, których ktoś naprawdę potrzebuje.',
            privacy: {
                title: 'Prywatność',
                storage:
                    'Dane są przechowywane w Cloudflare z solidną ochroną. Bot zapisuje tylko twoją nazwę użytkownika i, jeśli pozwolisz, numer telefonu.',
                phone: 'Numer telefonu nigdy nie jest pokazywany innym: służy tylko do znalezienia twojej listy.',
                name: 'Imię z Telegrama pojawia się na publicznej stronie dopiero po twojej zgodzie i znika, gdy tylko przestaniesz udostępniać.',
                photos: 'Zdjęcia życzeń widzą tylko osoby, którym pokazujesz swoją listę.'
            },
            openSource: {
                title: 'Otwarty kod',
                text: 'Kod jest otwarty na licencji AGPL-3.0: każdy może sprawdzić, jak aplikacja obchodzi się z danymi, albo dołączyć do rozwoju.'
            },
            languages: {
                title: 'Języki',
                text: 'Aplikacja i bot działają po polsku, angielsku i ukraińsku. Jeśli chcesz pomóc w tłumaczeniu na inny język, napisz w opinii.'
            },
            links: {
                title: 'Linki',
                github: 'Kod na GitHubie',
                princess: 'Księżniczka dnia, kolejny bot autora',
                youtube: 'Kanał autora na YouTube',
                telegram: 'Kanał autora w Telegramie',
                x: 'Autor na X'
            },
            version: 'Wersja {version}'
        },
        settings: {
            title: 'Ustawienia',
            groups: {
                profile: 'Profil',
                app: 'Aplikacja'
            },
            visibility: 'Widoczność',
            payments: 'Dane płatnicze',
            language: 'Język',
            languageAuto: 'Automatycznie: {language}',
            paymentsSet: 'Dodane',
            paymentsEmpty: 'Nie dodano',
            visibilityNone: 'Nie ustawiono',
            currency: 'Waluta',
            delivery: 'Adres dostawy',
            deliverySet: 'Dodany',
            deliveryEmpty: 'Nie dodano',
            theme: {
                title: 'Motyw',
                system: 'Jak w Telegramie',
                systemHint: 'Jasny lub ciemny, tak jak teraz w Telegramie.',
                light: 'Jasny',
                dark: 'Ciemny'
            }
        }
    }
};

export default pl;
