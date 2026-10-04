import type { Translation } from '../i18n-types';

const pl: Translation = {
    title: 'Lista życzeń ❤️',
    errors: {
        unknown: '🤷 Ups, coś poszło nie tak…',
        outdatedButton: 'Ten przycisk jest już nieaktualny. Oto menu główne 👇'
    },
    language: {
        title: '🇵🇱 PL | 🇺🇸 EN | 🇺🇦 UA',
        description:
            '🇵🇱 Zmień język interfejsu bota.\n🇺🇸 Change the bot’s language.\n🇺🇦 Змінити мову для інтерфейсу боту.\n\n🎲 W trybie automatycznym bot używa języka ustawionego w Telegramie.\n🎲 Choose Auto to match your Telegram language.\n🎲 Якщо обрати автоматичний режим, мова інтерфейсу боту буде така сама, як вказана в налаштуваннях Телеграму.',
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
        home: '🏠 Menu główne',
        back: '🔙 Wróć',
        open: '🔗 Otwórz',
        edit: '✏️ Edytuj',
        remove: '❌ Usuń',
        clean: '🧹 Wyczyść',
        share: '💌 Udostępnij',
        yes: '✅ Tak',
        no: '❌ Nie',
        more: 'Pokaż więcej',
        language: '🌐',
        openApp: '📱 Otwórz aplikację'
    },
    greeting: {
        general:
            'Hejka!\nJak często zdarza ci się nie wiedzieć, co podarować ważnej dla ciebie osobie,\nalbo nie móc sobie przypomnieć, czego pragniesz, gdy ktoś pyta – „<i>co ci podarować?</i>”?\nNie wiem jak ty, ale ja mam tak ciągle…\nJest wyjście! Ale nie przez okno :D\nPodziel się tym botem z rodziną, przyjaciółmi i znajomymi, żeby ułatwić życie im i sobie :)',
        guest: 'W tym bocie możesz:\n\n❤️ Prowadzić własną listę życzeń.\n🎁 Przeglądać swoją listę <b>Chcę podarować</b>.\n🔎 Znaleźć listę życzeń innej osoby.\n\n👤 <b>Najpierw musisz się jednak zarejestrować.</b>\n\n🧐 Teraz możesz kliknąć\n<b>Dowiedz się więcej</b>, żeby poznać szczegóły o bocie i o tym, jak wykorzystujemy dane.\n\n💬 A jeśli coś nie działa, daj znać przyciskiem <b>Zostaw opinię</b>.',
        user: 'Co chcesz zrobić?'
    },
    privacy: {
        title: '🧐 Dowiedz się więcej',
        description: {
            sensitive:
                '<b>Dane prywatne</b>\n\nNumer telefonu to prywatna informacja każdego użytkownika!\nDomyślnie numer służy wyłącznie do tego, żeby osoby, które go znają, mogły znaleźć twoją listę życzeń. Jeśli to włączysz, numer (i adres dostawy, jeśli go dodasz) zobaczą osoby, które otworzą twoją listę w Telegramie, ale nigdy na stronie w przeglądarce.\nBot ma otwarty kod (open source), który możesz obejrzeć pod linkiem do GitHuba.\nBaza użytkowników jest bezpiecznie przechowywana w Cloudflare.\nBot zapisuje wyłącznie twoją nazwę użytkownika i/lub numer telefonu oraz adres dostawy, jeśli go dodasz.\nŻadnych imion ani nazwisk, dopóki nie udostępnisz listy życzeń: wtedy bot zapisze imię z twojego Telegrama, żeby pokazać je na publicznej stronie. Gdy wyłączysz udostępnianie, imię zostanie usunięte.\nDzięki za zainteresowanie tym ważnym tematem ❤️',
            openSource:
                '\n\n<b>Otwarty kod (Open Source)</b>\n\nOtwarty kod oznacza, że każdy chętny może\n- włączyć się w ulepszanie projektu\n- zobaczyć, jak napisany jest kod\n- ponadto projekt ma licencję GNU AGPLv3, więc kod można wykorzystać w dowolnym innym projekcie, nawet komercyjnym, pod warunkiem udostępnienia zmian na tej samej licencji.',
            languages:
                '\n\n<b>Języki</b>\n\nBot mówi po polsku, angielsku i ukraińsku.\nJęzyk możesz zmienić przyciskiem 🌐 lub poleceniem /lang, a w trybie automatycznym bot dopasuje się do języka twojego Telegrama.\nJeśli chcesz pomóc w tłumaczeniach na inne języki, zostaw swoje dane kontaktowe w opinii.',
            rates: '\n\n<b>Ceny</b>\n\nCeny w innych walutach są orientacyjne, przeliczone według oficjalnego dziennego kursu Narodowego Banku Ukrainy.',
            feedback: '\n\n<b>Zostaw opinię</b>',
            otherProjects: {
                title: '\n\n<b>Inne projekty</b>',
                projects: {
                    princess:
                        'Księżniczka dnia – bot w Telegramie stworzony dla zabawy.\nWybiera losowego uczestnika grupy na księżniczkę dnia i generuje miłe powitanie ☺️',
                    youtube:
                        'Kanał na YouTubie, na którym uczę programowania i dzielę się swoim doświadczeniem.',
                    telegram:
                        'Kanał w Telegramie, który powstał obok kanału na YouTubie – na ciekawostki zza kulis i kontakt z widzami.'
                }
            }
        },
        links: {
            github: '🔗 GitHub',
            x: '🔗 X',
            princess: '🔗 Księżniczka dnia 🇺🇦',
            youtube: '🔗 YouTube',
            telegram: '🔗 Kanał w Telegramie'
        }
    },
    feedback: {
        title: '💬 Zostaw opinię',
        description: {
            title: '💬 Tu możesz napisać wszystko, co myślisz :)',
            points: '\n\n- jak bardzo podoba ci się bot 😅\n- coś się zepsuło i trzeba to naprawić\n- propozycje usprawnień\n- chcesz pomóc w tłumaczeniu na inne języki\n\nJeśli potrzebujesz odpowiedzi, zostaw dane kontaktowe, na przykład nazwę użytkownika w Telegramie, numer telefonu albo adres e-mail, żebym mógł do ciebie napisać i pomóc rozwiązać problem.'
        },
        message: '#opinia od {0}\n\n{1}',
        fromApp: '#opinia z aplikacji od {0}\n\n{1}',
        success: 'Dzięki za wiadomość ☺️\nPrzeczytam jak najszybciej!',
        errors: {
            tooLong:
                '❌ Ta opinia jest za długa! Maksymalna liczba znaków: {0}.\nSkróć ją i wyślij jeszcze raz.'
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
                '\n\nJeśli wybierzesz\n{username}\nlub\n{both},\nbot sam zaktualizuje twoją nazwę użytkownika, gdy zmienisz ją w Telegramie.\nNie musisz nic aktualizować ręcznie.'
        },
        types: {
            username: '👤 Tylko po nazwie użytkownika',
            phone: '📱 Tylko po numerze telefonu',
            both: '👤 📱 Po nazwie użytkownika i numerze'
        },
        sendNumber: {
            title: '📱 Udostępnij numer',
            description:
                'Potrzebuję twojego numeru, żeby inni mogli cię znaleźć.\nNie martw się: domyślnie służy tylko do wyszukiwania. Inni zobaczą go tylko w Telegramie i tylko wtedy, gdy to włączysz.\n\nKliknij przycisk:\n📱 <b>Udostępnij numer</b>\nNie musisz wpisywać numeru ręcznie!'
        },
        errors: {
            username:
                '❌ Nie masz jeszcze nazwy użytkownika.\nDodaj ją w ustawieniach Telegrama i wróć ;)',
            phone: '❌ To nie wygląda na numer telefonu. Spróbuj jeszcze raz.\nKliknij przycisk <b>Udostępnij numer</b> na dole ekranu, zamiast wpisywać numer ręcznie.',
            foreignContact:
                '❌ To nie jest twój kontakt.\nKliknij przycisk <b>Udostępnij numer</b> na dole ekranu, żeby udostępnić własny numer.'
        },
        success: {
            user: '✅ Ustawienia zostały zaktualizowane!',
            guest: '✅ Wszystko gotowe!',
            username:
                '\n👤 Będzie można cię znaleźć po nazwie użytkownika:\n@{0}',
            phone: '\n📱 Będzie można cię znaleźć po numerze telefonu:\n{0}',
            both: '\nBędzie można cię znaleźć\n👤 Po nazwie użytkownika: @{0}\n📱 I po numerze telefonu: {1}',
            app: '✅ Mamy twój numer! Wróć do aplikacji – wszystko jest już zaktualizowane.'
        }
    },
    wishlist: {
        title: '❤️ Moja lista życzeń',
        empty: 'Twoja lista życzeń jest jeszcze pusta!\nDodaj pierwsze życzenie.',
        filtered:
            'Żadne życzenie nie pasuje do tego filtra.\nSpróbuj go wyczyścić.',
        filled: {
            before: '<b>Oto twoja lista życzeń:</b>',
            after: '❓<b>Co chcesz zrobić?</b>\n\n➕ Dodać nowe życzenie do listy.\n✏️ Edytować istniejące życzenie na liście.\n❌ Usunąć istniejące życzenie z listy.\n🧹 Wyczyścić listę życzeń.\n💌 Udostępnić listę życzeń za pomocą linku.'
        },
        add: {
            title: '➕ Nowe życzenie',
            description:
                'Podaj nazwę nowego życzenia w następnej wiadomości.\nMaksymalna liczba znaków: {0}.',
            error: '❌ To nie wygląda na dobrą nazwę!\nSpróbuj jeszcze raz.',
            success: '✅ Nowe życzenie zostało dodane do listy!',
            limit: '❌ Lista życzeń jest pełna: może zawierać do 500 życzeń.\nNajpierw usuń kilka z nich.',
            import: {
                prompt: 'Wyślij link do produktu lub po prostu napisz nazwę.\nPostaram się uzupełnić resztę na podstawie linku. Nazwa może mieć do {max} znaków.',
                withoutLink: 'Bez linku',
                searching: 'Wyszukiwanie produktu…',
                filledFrom:
                    '🔗 Uzupełniono na podstawie {host}. Sprawdź i w razie potrzeby zmień.',
                sourcePrice: 'Cena w sklepie: {price}',
                failed: 'Nie udało się odczytać strony. Napisz nazwę życzenia, a link zachowam.',
                photosFailed: 'Nie udało się pobrać zdjęć. Dodaj je ręcznie.',
                photosUnsupported:
                    'Niektóre zdjęcia mają nieobsługiwany format. Dodaj je ręcznie.',
                rateLimited:
                    'Zbyt wiele linków z rzędu. Spróbuj później lub napisz nazwę.',
                cancel: '❌ Anuluj',
                offer: {
                    text: 'Dodać ten link jako życzenie?',
                    confirm: '✅ Dodaj jako życzenie',
                    expired: 'Ten link wygasł. Wyślij go jeszcze raz.'
                }
            }
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
                show: '👀 Pokaż innym',
                addPrice: '💸 Dodaj cenę',
                updatePrice: '💸 Zaktualizuj cenę'
            },
            scenes: {
                title: '✏️ Podaj nową nazwę życzenia.\nMaksymalna liczba znaków: {0}.',
                addDescription:
                    '✏️ Dodaj opis do tego życzenia.\nMaksymalna liczba znaków: {0}.',
                updateDescription:
                    '✏️ Zmień opis (maksymalna liczba znaków: {0}) albo ❌ usuń go',
                addImages: '🌅 Dodaj nowe zdjęcia (maksymalnie 9)',
                updateImages:
                    '🌅 Dodaj nowe zdjęcia (maksymalnie 9) albo ❌ usuń wszystkie dodane',
                addLink: '🔗 Dodaj link',
                updateLink: '🔗 Zmień link albo ❌ usuń go',
                addPrice: '💸 Dodaj cenę',
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
                link: '❌ Link musi zaczynać się od http:// lub https://!',
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
                    'ℹ️ Zapisano tylko 9 zdjęć: do jednego życzenia nie można dodać więcej.'
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
                '❓Czy twoje życzenie się spełniło?\n(Tylko do statystyk – życzenie i tak zostanie usunięte.)',
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
            empty: '❌ Na razie nie ma czego udostępnić: lista życzeń jest pusta.\nNajpierw dodaj przynajmniej jedno życzenie.',
            consent:
                '🌐 Zanim udostępnisz\n\nBot utworzy publiczną stronę twojej listy życzeń na {host}. Będą na niej:\n• imię z twojego profilu w Telegramie: {name}\n• twój @username, tylko jeśli go włączysz\n• wszystkie życzenia oprócz ukrytych, wraz z ich zdjęciami\n• twoje dane płatnicze, jeśli są dodane i włączone\n\nStronę może otworzyć każdy, kto ma link, i może ona pojawić się w wynikach wyszukiwarek. Numer telefonu, adres dostawy i lista „Chcę podarować” nigdy nie są tam pokazywane; numer i adres, jeśli je włączysz, zobaczą tylko osoby w Telegramie.\n\nUdostępnianie możesz wyłączyć w każdej chwili.',
            ready: '✅ Twoja lista życzeń jest gotowa!\n\n📲 Otwórz w Telegramie:\n{appUrl}\n\n🌐 Strona w przeglądarce:\n{pageUrl}\n\nStrona aktualizuje się sama po każdej zmianie na liście.',
            stopConfirm:
                '❓ Wyłączyć udostępnianie listy życzeń?\n\nStrona przestanie się otwierać, a zapisane imię zostanie usunięte. Jeśli później udostępnisz listę ponownie, zadziała ten sam link, więc każdy, kto go ma, znów zobaczy twoją listę.',
            stopped:
                '✅ Gotowe, twoja lista życzeń nie jest już udostępniana.\nStrona pod linkiem już się nie otwiera.',
            newConfirm:
                '❓ Utworzyć nowy link?\n\nStary link od razu przestanie działać i nikt już nie otworzy przez niego twojej listy. Nowy link trzeba będzie ponownie wysłać znajomym.',
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
                showUsername: '👤 Pokaż mój @username',
                hideUsername: '🙈 Ukryj mój @username',
                showGifted: '🎁 Pokaż podarowane życzenia',
                hideGifted: '🙈 Ukryj podarowane życzenia'
            },
            gifted: {
                shown: '🎁 Na końcu listy znajomi zobaczą, co już zostało ci podarowane.',
                hidden: '🙈 Znajomi nie widzą już podarowanych życzeń.'
            }
        }
    },
    giveList: {
        title: '🎁 Chcę podarować',
        empty: 'Twoja lista <b>Chcę podarować</b> jest na razie pusta. Pojawią się tu życzenia, które zarezerwujesz.\n🔎 Znajdź listę życzeń innej osoby, żeby zarezerwować życzenie.',
        filled: {
            before: '<b>Oto twoje rezerwacje:</b>',
            after: '❓<b>Co chcesz zrobić?</b>\n\n❌ Anulować rezerwację życzenia.\n🧹 Wyczyścić listę <b>Chcę podarować</b>.'
        },
        givers: '\n\n👥 <i>Rezerwacje innych osób: {0}</i>',
        owner: '\n\n👤 Dla: <b>{0}</b>',
        success: {
            remove: '✅ Rezerwacja anulowana, życzenie usunięto z listy <b>Chcę podarować</b>!',
            clean: '✅ Wszystkie rezerwacje anulowane, lista <b>Chcę podarować</b> jest pusta!'
        },
        clean: {
            confirm:
                '❓<b>Na pewno wyczyścić listę „Chcę podarować”?</b>\n\nWszystkie twoje rezerwacje zostaną anulowane, a życzenia znikną z tej listy.'
        }
    },
    findList: {
        title: '🔎 Znajdź listę życzeń',
        description:
            'Spróbuj znaleźć osobę po nazwie użytkownika lub numerze telefonu.\n\nPowody, dla których osoby nie można znaleźć:\n1. Ta osoba nie korzysta jeszcze z bota.\n2. Jeśli szukasz po numerze telefonu i masz pewność, że numer jest prawidłowy…\nMożliwe, że ta osoba nie udostępniła botowi swojego numeru.\nSpróbuj poszukać po nazwie użytkownika.\n\n<b>Wpisz nazwę użytkownika lub numer telefonu tej osoby w następnej wiadomości.</b>',
        empty: 'Ta osoba jeszcze nie uzupełniła listy życzeń.',
        filtered:
            'Żadne życzenie nie pasuje do tego filtra.\nSpróbuj go wyczyścić.',
        filled: {
            before: 'Lista życzeń: <b>{0}</b>',
            payments:
                'Jeśli nie możesz kupić konkretnego prezentu, możesz przelać pieniądze na podane dane, a ta osoba kupi go sama:\n\n{0}',
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
                '\n\n👥 <i>Zarezerwowane przez ciebie i jeszcze {0} os.</i>',
            somebody: '\n\n👥 <i>Zarezerwowane przez {0} os.</i>'
        },
        actions: {
            give: '🎁 Zarezerwuj',
            take: '❌ Anuluj rezerwację'
        },
        errors: {
            give: '❌ To życzenie jest już przez ciebie zarezerwowane!',
            take: '❌ Tego życzenia nie ma wśród twoich rezerwacji!',
            notFound: '❌ Nie znaleziono osoby, spróbuj jeszcze raz!',
            foundYourself: '❌ Sprytnie, ale siebie nie wyszukasz! 😘',
            tooLong:
                '❌ To zapytanie jest za długie! Maksymalna liczba znaków: {0}. Spróbuj jeszcze raz.'
        },
        success: {
            give: '✅ Zarezerwowano! Życzenie trafiło na listę <b>Chcę podarować</b>.',
            take: '✅ Rezerwacja anulowana, życzenie usunięto z listy <b>Chcę podarować</b>.'
        }
    },
    donate: {
        title: '💸 Wesprzyj autora darowizną 🥹👉👈',
        description:
            'Bot będzie darmowy tak długo, jak to możliwe, żebyśmy my – Ukraińcy – mogli sprawiać sobie nawzajem prezenty.\nTo bardzo ważne, to naprawdę potrzebne. Bo mamy siebie nawzajem!\n\nAle jeśli chcesz wesprzeć autora, możesz to zrobić za pomocą serwisów wymienionych poniżej albo bezpośrednio przez PayPal:\n{paypal}\n\nA ja będę ci szczerze wdzięczny ❤️\n\nWiększość darowizn trafia na zbiórki dla Sił Zbrojnych Ukrainy.\nZbiórki i rozliczenia znajdziesz na moim kanale w Telegramie pod linkiem poniżej.',
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
        telegram: '🔗 Kanał w Telegramie'
    },
    share: {
        title: '{name} – lista życzeń'
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
            created: '\n\n🗓 <i>Dodano: {0}</i>',
            updated: '\n🗓 <i>Zaktualizowano: {0}</i>'
        }
    },
    payments: {
        title: {
            add: '💸 Dodaj dane płatnicze',
            update: '💸 Zmień dane płatnicze'
        },
        description: {
            add: 'Tu możesz dodać dane płatnicze na wypadek, gdyby ktoś chciał podarować ci coś z listy życzeń, ale nie mógł tego kupić i wolał przesłać ci pieniądze na prezent.\n\nPodaj tylko te dane, które chcesz pokazać innym, na przykład:\n- Numer konta lub telefon do BLIK\n- Adres PayPal\n- Link do zrzutki lub Buy Me a Coffee\n- Skarbonkę (np. słoik w Monobanku){current}\n\n<b>Wyślij dane płatnicze w następnej wiadomości.</b>',
            update: '<b>Twoje aktualne dane płatnicze:</b>\n{0}'
        },
        edit: {
            error: '❌ To nie wygląda na prawidłowe dane!\nSpróbuj jeszcze raz.',
            success: '✅ Dane płatnicze zostały zaktualizowane!',
            tooLong:
                '❌ Dane płatnicze są za długie! Maksymalna liczba znaków: {0}.\nSpróbuj jeszcze raz.'
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
            'Wybierz walutę, w której podajesz cenę nowych życzeń. Każde życzenie zachowuje własną walutę, a inni widzą kwoty orientacyjnie, przeliczone według oficjalnego kursu dziennego.\n\nAktualna waluta: <b>{current}</b>',
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
            update: '📦 Zmień adres dostawy'
        },
        description:
            'Napisz, dokąd wysyłać prezenty, na przykład do paczkomatu lub punktu odbioru. Od 5 do 300 znaków, maksymalnie 6 wierszy, bez linków.{current}\n\n<b>Wyślij nowy adres w następnej wiadomości.</b>',
        phoneWarning:
            'ℹ️ Adres jest pokazywany innym tylko razem z numerem telefonu. Możesz to włączyć w sekcji „Co widzą inni”.',
        errors: {
            tooShort:
                '❌ Za mało informacji: dodaj trochę więcej szczegółów.\nSpróbuj jeszcze raz.',
            tooLong:
                '❌ Adres jest za długi! Maksymalna liczba znaków: {max}.\nSpróbuj jeszcze raz.',
            containsLink:
                '❌ Adres nie może zawierać linków.\nSpróbuj jeszcze raz.',
            tooManyLines:
                '❌ Za dużo wierszy: maksymalnie 6.\nSpróbuj jeszcze raz.'
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
            phone: '❓ Pokazywać numer telefonu?\n\nZobaczy go każdy, kto otworzy twoją listę życzeń w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Na stronie w przeglądarce numer nigdy nie jest pokazywany. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.',
            address:
                '❓ Pokazywać adres dostawy?\n\nZobaczy go każdy, kto otworzy twoją listę życzeń w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Adres jest pokazywany tylko razem z numerem telefonu i nigdy na stronie w przeglądarce. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.',
            both: '❓ Pokazywać adres dostawy razem z numerem telefonu?\n\nBez numeru telefonu sam adres niewiele pomoże, dlatego pokażemy oba. Zobaczy je każdy, kto otworzy twoją listę w Telegramie, ale nigdy nie są pokazywane na stronie w przeglądarce.'
        },
        needsAddress: '❌ Najpierw dodaj adres dostawy.',
        phoneMissing:
            '❌ Bot nie ma twojego numeru telefonu. Najpierw w sekcji „Zmień widoczność” pozwól, żeby inni mogli cię znajdować po numerze.',
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
        description: 'Pokaż tylko życzenia z wybranego przedziału cenowego.',
        applied: '\n\nZastosowany filtr ceny:\n<b>{0}</b>',
        fromTo: 'Od {0} do {1}',
        from: 'Od {0}',
        to: 'Do {0}',
        reset: '❌ Wyczyść filtr',
        success: {
            reset: '✅ Filtr został wyczyszczony!',
            set: '✅ Filtr został ustawiony!'
        }
    },
    pagination: {
        range: 'Pokazano {0}–{1} z {2}'
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
            lead: 'Lista życzeń',
            fallback: 'Lista życzeń'
        },
        payments: {
            title: 'Możesz też podarować pieniądze'
        },
        wish: {
            priority: {
                low: 'Trochę tego chce',
                medium: 'Chce tego',
                high: 'Bardzo tego chce'
            },
            price: 'Orientacyjna cena:',
            approx: '≈ {amount}',
            original: '(w oryginale {amount})',
            link: 'Otwórz na {host}',
            photo: 'Zdjęcie {index} z {total}',
            photos: 'Zdjęcia, {count}',
            photoCount: '{count} {{count:|zdjęcie||zdjęcia|zdjęć|zdjęcia}}',
            details: 'Szczegóły',
            created: 'Dodano {date}',
            updated: 'Dodano {created}, zaktualizowano {updated}',
            gifted: 'Podarowane'
        },
        empty: 'Na razie nic tu nie ma. Życzenia pojawią się, gdy tylko zostaną dodane do listy.',
        truncated: 'Pokazano pierwsze {limit} życzeń z listy.',
        ratesNote:
            'Ceny są orientacyjne, przeliczone na {currency} według oficjalnego kursu dziennego z {date}.',
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
                'Ta lista nie jest już udostępniana. Jeśli zostanie udostępniona ponownie, link zadziała.'
        },
        meta: {
            description:
                '{name} – lista życzeń, {count} {{count:|życzenie||życzenia|życzeń|życzenia}}'
        },
        home: {
            title: 'Lista życzeń: bot w Telegramie do zbierania życzeń i pomysłów na prezenty',
            description:
                'Zbieraj życzenia w Telegramie, udostępnij jeden link, a bliscy podarują ci dokładnie to, czego chcesz. Za darmo, po polsku, ukraińsku i angielsku.',
            name: 'Lista życzeń',
            tagline:
                'Zapisuj życzenia w Telegramie, udostępnij link, a bliscy wybiorą prezent, który naprawdę cię ucieszy.',
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
                    text: 'Bot utworzy publiczną stronę twojej listy. Wyślij link znajomym albo pozwól im znaleźć cię w bocie po nazwie użytkownika lub numerze telefonu.'
                },
                give: {
                    title: 'Znajomi rezerwują życzenie',
                    text: 'Klikają „Zarezerwuj” i życzenie trafia na ich listę „Chcę podarować”. Inni znajomi widzą, że jest już zarezerwowane, a ty nie, więc niespodzianka pozostaje niespodzianką.'
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
                    text: 'Szkice i sprawy osobiste zostają przy tobie: ukryte życzenia widzisz tylko ty.'
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
                phone: 'Numer telefonu nigdy nie trafia na stronę: domyślnie służy tylko do wyszukiwania, a o tym, czy zobaczą go inni w Telegramie, decydujesz ty.',
                name: 'Imię pojawia się na stronie dopiero po twojej zgodzie i znika, gdy tylko przestaniesz udostępniać listę.',
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
            undo: 'Cofnij',
            save: 'Zapisz',
            saving: 'Zapisywanie…',
            send: 'Wyślij',
            sending: 'Wysyłanie…',
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
            moreActions: 'Więcej opcji',
            optional: 'Opcjonalnie',
            counter: '{count} z {max}',
            charactersLeft:
                'Pozostało: {count} {{count:|znak||znaki|znaków|znaku}}',
            limitReached: 'Osiągnięto limit znaków',
            notSet: 'Nie podano',
            on: 'Włączone',
            off: 'Wyłączone',
            newBadge: 'Nowość'
        },
        a11y: {
            priority: {
                low: 'Trochę tego chcę',
                medium: 'Chcę tego',
                high: 'Bardzo tego chcę'
            },
            priorityThird: 'Bardzo tego chce',
            hidden: 'Ukryte życzenie, widzisz je tylko ty',
            photo: 'Zdjęcie {index} z {total}: {title}',
            photos: 'Zdjęcia, {count}',
            photoPlaceholder: 'Brak zdjęcia',
            menu: 'Menu',
            closeToast: 'Zamknij komunikat',
            countdown: {
                started:
                    'Nastąpi to za {seconds} {{seconds:|sekundę||sekundy|sekund|sekundy}}. Naciśnij „Anuluj”, aby zatrzymać.',
                cancelled: 'Anulowano'
            },
            mainNavigation: 'Nawigacja główna',
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
            forbidden: 'Nie masz uprawnień do tej czynności.',
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
            internal: 'Wystąpił błąd po naszej stronie. Spróbuj ponownie.',
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
            title: 'Zaktualizuj Telegram',
            text: 'Twoja wersja Telegrama nie obsługuje tej aplikacji. Zaktualizuj Telegram albo korzystaj z bota w czacie.',
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
            lead: 'Wybierz walutę, w której podajesz cenę nowych życzeń. Każde życzenie zachowuje własną walutę, a inni widzą kwoty orientacyjnie, według oficjalnego kursu dziennego.',
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
            removed: 'Usunięto adres',
            errors: {
                tooManyLines: 'Maksymalnie 6 wierszy.',
                containsLink: 'Linki w adresie są niedozwolone.'
            }
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
                    text: 'Twoje rezerwacje prezentów'
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
                lead: 'Zapisuj życzenia, udostępniaj link, a bliscy wybiorą prezent, który naprawdę cię ucieszy.',
                stepsTitle: 'Jak to działa',
                steps: {
                    create: {
                        title: 'Utwórz listę',
                        text: 'Dodaj życzenia: nazwę, opis, do 9 zdjęć, cenę i link do sklepu.'
                    },
                    share: {
                        title: 'Udostępnij link',
                        text: 'Wyślij znajomym link do swojej strony albo daj się znaleźć po nazwie użytkownika lub numerze telefonu.'
                    },
                    give: {
                        title: 'Znajomi rezerwują życzenie',
                        text: 'Znajomi widzą, które życzenia są już zarezerwowane. Ty nie, więc niespodzianka zostaje niespodzianką.'
                    }
                },
                cta: 'Zaczynamy',
                note: 'Aby utworzyć listę, wybierz, jak inni mają cię znajdować. To zajmie minutę.'
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
                priorityChanged: 'Priorytet: {level}',
                priorityRemoved: 'Usunięto priorytet',
                hidden: 'Teraz to życzenie widzisz tylko ty',
                shown: 'Teraz to życzenie widzą inni'
            }
        },
        gifted: {
            band: 'Podarowane',
            date: 'Podarowano {date}',
            restore: 'Przywróć do moich życzeń',
            hide: 'Ukryj na zawsze dla wszystkich',
            hideHint:
                'Nikt już nie zobaczy tego życzenia – ani ty, ani znajomi. Nadal będzie liczone w statystykach.',
            restored: 'Życzenie znów jest na liście',
            hidden: 'Ukryto'
        },
        money: {
            approx: '≈ {amount}',
            original: '(w oryginale {amount})'
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
            hint: 'Do {max} zdjęć. Pierwsze będzie zdjęciem głównym.',
            count: '{count} z {max}',
            add: 'Dodaj zdjęcia',
            remove: 'Usuń zdjęcie',
            removeAll: 'Usuń wszystkie zdjęcia',
            uploading: 'Przesyłanie zdjęć…',
            progress: 'Przesłano {done} z {total}',
            uploaded: 'Dodano zdjęcie',
            duplicate: 'To zdjęcie jest już dodane',
            failed: 'Nie udało się przesłać zdjęcia',
            full: 'Nie można dodać więcej niż {max} zdjęć',
            tooLarge: 'Zdjęcie jest za duże',
            unsupported: 'Ten format nie jest obsługiwany',
            queued: 'Zdjęcia zostaną przesłane po zapisaniu',
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
        linkImport: {
            title: 'Dodaj życzenie',
            hint: 'Wklej link do produktu, a my spróbujemy uzupełnić resztę.',
            urlLabel: 'Link do produktu',
            urlPlaceholder: 'https://…',
            paste: 'Wklej',
            continue: 'Dalej',
            withoutLink: 'Dodaj bez linku',
            loading: 'Wyszukiwanie produktu na {host}…',
            filledFrom:
                'Uzupełniono na podstawie {host}. Sprawdź przed zapisaniem.',
            filledPartial:
                'Znaleziono tylko część danych na {host}. Sprawdź i uzupełnij.',
            sourcePrice: 'Cena w sklepie: {price}',
            photosFailed: 'Nie udało się pobrać zdjęć. Dodaj je ręcznie.',
            photosUnsupported:
                'Niektóre zdjęcia mają nieobsługiwany format. Dodaj je ręcznie.',
            errors: {
                invalidUrl:
                    'To nie wygląda na link do produktu. Sprawdź go i spróbuj jeszcze raz.',
                blocked:
                    'Sklep nie udostępnił danych. Uzupełnij życzenie ręcznie.',
                notProduct:
                    'Nie udało się odczytać strony. Uzupełnij życzenie ręcznie.',
                timeout:
                    'Strona odpowiada zbyt wolno. Uzupełnij życzenie ręcznie.',
                rateLimited:
                    'Zbyt wiele zapytań do tego sklepu. Uzupełnij życzenie ręcznie lub spróbuj później.',
                disabled:
                    'Uzupełnianie z linku jest teraz niedostępne. Uzupełnij życzenie ręcznie.'
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
            others: 'Zarezerwowane też przez {count} {{count:|inną osobę||inne osoby|innych osób|innej osoby}}',
            open: 'Otwórz',
            remove: 'Anuluj rezerwację',
            removed: 'Rezerwacja anulowana',
            clean: {
                action: 'Wyczyść listę',
                success: 'Lista wyczyszczona'
            }
        },
        find: {
            title: 'Znajdź listę życzeń',
            label: 'Nazwa użytkownika lub numer telefonu',
            placeholder: '@username lub +48…',
            hint: 'Możesz znaleźć osobę, która korzysta z bota i zgodziła się na wyszukiwanie.',
            submit: 'Znajdź',
            searching: 'Wyszukiwanie…',
            errors: {
                empty: 'Wpisz nazwę użytkownika lub numer telefonu.',
                notFound:
                    'Nie znaleziono nikogo. Sprawdź nazwę użytkownika lub numer.',
                self: 'To przecież twoja lista 😉 Jest w sekcji „Moje życzenia”.',
                tooLong:
                    'Zapytanie jest za długie (maksymalna liczba znaków: {max}).'
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
            priority: 'Bardzo tego chce',
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
                title: 'Możesz też podarować pieniądze',
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
                    'Numer telefonu, adres dostawy i lista „Chcę podarować” nigdy nie są tam pokazywane.',
                stop: 'Udostępnianie możesz wyłączyć w każdej chwili.'
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
                        'Twój adres dostawy zobaczy każdy, kto otworzy twoją listę w Telegramie: przez twój link albo wyszukując cię po nazwie użytkownika lub numerze. Adres jest pokazywany tylko razem z numerem telefonu i nigdy na stronie w przeglądarce. Wiadomości, które już zostały wysłane, pozostaną w czacie osoby, która je dostała.',
                    both: 'Bez numeru telefonu sam adres niewiele pomoże, dlatego pokażemy oba. Zobaczy je każdy, kto otworzy twoją listę w Telegramie, ale nigdy nie są pokazywane na stronie w przeglądarce.'
                },
                phoneMissing:
                    'Najpierw w sekcji „Widoczność” pozwól, żeby inni mogli cię znajdować po numerze.',
                addressMissing: 'Najpierw dodaj adres dostawy.'
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
            gifted: {
                label: 'Pokazuj podarowane życzenia',
                hint: 'Na końcu listy znajomi zobaczą, co już zostało ci podarowane',
                shown: 'Znajomi widzą teraz podarowane życzenia',
                hidden: 'Znajomi nie widzą już podarowanych życzeń'
            },
            rotate: {
                action: 'Nowy link',
                title: 'Utworzyć nowy link?',
                text: 'Stary link od razu przestanie działać. Nowy trzeba będzie wysłać znajomym jeszcze raz.',
                confirm: 'Utwórz',
                success: 'Nowy link jest gotowy, stary już nie działa'
            },
            stop: {
                action: 'Wyłącz udostępnianie',
                title: 'Wyłączyć udostępnianie?',
                text: 'Strona przestanie się otwierać, a zapisane imię zostanie usunięte. Jeśli udostępnisz listę ponownie, zadziała ten sam link.',
                confirm: 'Wyłącz',
                success: 'Nie udostępniasz już swojej listy życzeń'
            }
        },
        payments: {
            title: 'Dane płatnicze',
            lead: 'Jeśli ktoś chce podarować ci coś z listy, ale nie może tego kupić, może przelać pieniądze na te dane.',
            label: 'Dane płatnicze',
            hint: 'Numer konta, telefon do BLIK, PayPal albo link do zrzutki. Podaj tylko to, co chcesz pokazać innym.',
            placeholder: 'Na przykład numer konta lub telefon do BLIK',
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
                    hint: 'Domyślnie nikt nie widzi twojego numeru: służy tylko do wyszukiwania.'
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
            waiting: 'Oczekiwanie na numer…',
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
                another: 'Napisz kolejną'
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
            lead: 'Lista życzeń pomaga zbierać życzenia i wybierać prezenty, które naprawdę ucieszą.',
            privacy: {
                title: 'Prywatność',
                storage:
                    'Dane są bezpiecznie przechowywane w Cloudflare. Bot zapisuje tylko twoją nazwę użytkownika i, jeśli pozwolisz, numer telefonu.',
                phone: 'Numer telefonu służy do znalezienia twojej listy. Inni widzą go tylko w Telegramie i tylko jeśli włączysz to w „Co widzą inni”.',
                name: 'Imię z Telegrama pojawia się na publicznej stronie dopiero po twojej zgodzie i znika, gdy tylko przestaniesz udostępniać.',
                photos: 'Zdjęcia życzeń widzą tylko osoby, którym pokazujesz swoją listę.',
                rates: 'Ceny w innych walutach przeliczamy według oficjalnego dziennego kursu Narodowego Banku Ukrainy.'
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
                princess: 'Księżniczka dnia – inny bot autora',
                youtube: 'Kanał autora na YouTubie',
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
            paymentsSet: 'Dodano',
            paymentsEmpty: 'Nie dodano',
            visibilityNone: 'Nie ustawiono',
            currency: 'Waluta',
            delivery: 'Adres dostawy',
            deliverySet: 'Dodano',
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
