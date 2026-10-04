import type { Translation } from '../i18n-types';

const en: Translation = {
    title: 'Wishlist ❤️',
    errors: {
        unknown: '🤷 Oops, something went wrong.',
        outdatedButton: 'This button no longer works. Here’s the main menu 👇'
    },
    language: {
        title: '🇺🇸 EN | 🇺🇦 UA | 🇵🇱 PL',
        description:
            '🇺🇸 Change the bot’s language.\n🇺🇦 Змінити мову для інтерфейсу боту.\n🇵🇱 Zmień język interfejsu bota.\n\n🎲 Choose Auto to match your Telegram language.\n🎲 Якщо обрати автоматичний режим, мова інтерфейсу боту буде така сама, як вказана в налаштуваннях Телеграму.\n🎲 W trybie automatycznym bot używa języka ustawionego w Telegramie.',
        options: {
            uk: '🇺🇦 Ukrainian | Українська | Ukraiński',
            en: '🇺🇸 English | Англійська | Angielski',
            pl: '🇵🇱 Polish | Польська | Polski',
            auto: '🎲 Auto | Автоматично | Automatycznie'
        },
        names: {
            uk: 'Ukrainian',
            en: 'English',
            pl: 'Polish',
            auto: 'Auto'
        },
        success: '✅ Language set to {0}',
        current: 'Current language: {0}',
        invalid: '❌ Unknown language: {0}\nAvailable options: en, uk, pl, auto'
    },
    actions: {
        home: '🏠 Home',
        back: '🔙 Back',
        open: '🔗 Open',
        edit: '✏️ Edit',
        remove: '❌ Remove',
        clean: '🧹 Clear',
        share: '💌 Share',
        yes: '✅ Yes',
        no: '❌ No',
        more: 'Show more',
        language: '🌐',
        openApp: '📱 Open app'
    },
    greeting: {
        general:
            'Hey there!\nEver blanked when someone asked, “<i>What do you want as a gift?</i>” Or had no idea what to get someone you care about?\nI don’t know about you, but that happens to me all the time…\nGood news: there’s a fix!\nShare this bot with your family and friends to make gift-giving easier for everyone 🙂',
        guest: 'With this bot, you can:\n\n❤️ Create your wish list.\n🎁 See your <b>Gifts to give</b> list.\n🔎 Find someone else’s wish list.\n\n👤 <b>First, you’ll need to sign up.</b>\n\n🧐 Tap <b>Learn more</b> to see how the bot works and how your data is used.\n\n💬 Having trouble? Tap <b>Leave feedback</b>.',
        user: 'What would you like to do?'
    },
    privacy: {
        title: '🧐 Learn more',
        description: {
            sensitive:
                '<b>Private data</b>\n\nYour phone number is private!\nBy default, it’s used only so people who know your number can find your wish list. If you turn it on, people who open your list in Telegram also see it, along with your delivery address if you add one. It never appears on the web page.\nThe bot is open source, so you can check the code on GitHub via the link below.\nThe user database is stored securely on Cloudflare.\nThe bot stores only your username and/or phone number, plus a delivery address if you add one.\nNo first or last names, unless you share your wish list: then the bot keeps your Telegram name to show it on the public page. When you stop sharing, the name is deleted.\nThanks for caring about your privacy ❤️',
            openSource:
                '\n\n<b>Open source</b>\n\nOpen source means anyone can\n- help improve the project\n- see how the code is written\n- reuse the code: the project is licensed under GNU AGPLv3, so anyone can reuse it, even commercially, as long as they share their changes under the same license.',
            languages:
                '\n\n<b>Languages</b>\n\nThe bot speaks English, Ukrainian, and Polish.\nYou can change the language with the 🌐 button or the /lang command. In Auto mode, the bot follows your Telegram language.\nIf you’d like to help translate into other languages, leave your contact info in your feedback.',
            rates: '\n\n<b>Prices</b>\n\nPrices in other currencies are approximate, converted at the official daily rates of the National Bank of Ukraine.',
            feedback: '\n\n<b>Leave feedback</b>',
            otherProjects: {
                title: '\n\n<b>Other projects</b>',
                projects: {
                    princess:
                        'Princess of the Day, a Telegram bot made just for fun.\nIt picks a random group member as princess of the day and writes them a sweet greeting ☺️',
                    youtube:
                        'A YouTube channel where I teach programming and share my experience.',
                    telegram:
                        'A Telegram channel that goes with my YouTube channel, for behind-the-scenes updates and audience feedback.'
                }
            }
        },
        links: {
            github: '🔗 GitHub',
            x: '🔗 X',
            princess: '🔗 Princess of the Day 🇺🇦',
            youtube: '🔗 YouTube',
            telegram: '🔗 Telegram channel'
        }
    },
    feedback: {
        title: '💬 Leave feedback',
        description: {
            title: '💬 Tell me what you think about the bot 🙂',
            points: '\n\n- how much you like the bot 😅\n- something’s broken and needs fixing\n- ideas for improvement\n- you’d like to help translate the bot into other languages\n\nIf you’d like a reply, leave your contact info, for example, your Telegram username, phone number, or email, so I can get back to you and help.'
        },
        message: '#feedback from {0}\n\n{1}',
        fromApp: '#feedback from the app by {0}\n\n{1}',
        success: 'Thanks for reaching out ☺️\nI’ll read it as soon as I can!',
        errors: {
            tooLong:
                '❌ That’s too long! The limit is {0} characters.\nShorten it and send it again.'
        }
    },
    auth: {
        title: {
            guest: '👤 Sign up',
            user: '👤 Change visibility'
        },
        description: {
            general: 'How do you want people to find you?',
            user: '<b>Right now you can be found:</b>\n{0}',
            guest: '\n\n<b>You can change this later!</b>',
            username:
                '\n\nIf you choose\n{username}\nor\n{both},\nthe bot picks up username changes automatically, so there’s nothing to update.'
        },
        types: {
            username: '👤 By username only',
            phone: '📱 By phone number only',
            both: '👤 📱 By username and phone number'
        },
        sendNumber: {
            title: '📱 Share my number',
            description:
                'I need your number so people can find you.\nDon’t worry: by default, it’s used only for search. Others see it only in Telegram, and only if you turn that on.\n\nTap the button:\n📱 <b>Share my number</b>\nNo need to type it in!'
        },
        errors: {
            username:
                '❌ You don’t have a username yet.\nAdd one in your Telegram settings and come back ;)',
            phone: '❌ That doesn’t look like a phone number. Try again.\nTap the <b>Share my number</b> button at the bottom of the screen instead of typing the number.',
            foreignContact:
                '❌ That’s not your contact.\nTap the <b>Share my number</b> button at the bottom of the screen to share your own number.'
        },
        success: {
            user: '✅ Your settings are updated!',
            guest: '✅ You’re all set!',
            username: '\n👤 People can find you by username:\n@{0}',
            phone: '\n📱 People can find you by phone number:\n{0}',
            both: '\nPeople can find you\n👤 By username: @{0}\n📱 And by phone number: {1}',
            app: '✅ Got your number! Head back to the app. Everything’s already updated there.'
        }
    },
    wishlist: {
        title: '❤️ My wish list',
        empty: 'Your wish list is empty for now.\nAdd your first wish!',
        filtered: 'No wishes match this filter.\nTry resetting it.',
        filled: {
            before: '<b>Here is your wish list:</b>',
            after: '❓<b>What would you like to do?</b>\n\n➕ Add a new wish.\n✏️ Edit a wish.\n❌ Remove a wish.\n🧹 Clear your wish list.\n💌 Share your wish list with a link.'
        },
        add: {
            title: '➕ New wish',
            description:
                'Send me the title of your new wish.\n{0} characters max.',
            error: '❌ That doesn’t look like a valid title.\nTry again.',
            success: '✅ Wish added to your list!',
            limit: '❌ Your wish list is full (500 wishes max).\nRemove a few wishes first.',
            import: {
                prompt: 'Send a link to the product or just type a title.\nI’ll try to fill in the rest from the link. Titles can be up to {max} characters.',
                withoutLink: 'No link',
                searching: 'Looking for the product…',
                filledFrom:
                    '🔗 Filled in from {host}. Check it and change anything you need.',
                sourcePrice: 'Price on the site: {price}',
                failed: 'Couldn’t read the page. Send the title of your wish, and I’ll keep the link.',
                photosFailed: 'Couldn’t load the photos. Add them manually.',
                photosUnsupported:
                    'Some photos are in an unsupported format. Add them manually.',
                rateLimited:
                    'Too many links in a row. Try again a bit later or type a title.',
                cancel: '❌ Cancel',
                offer: {
                    text: 'Add this link as a wish?',
                    confirm: '✅ Add as a wish',
                    expired: 'This link has expired. Send it again.'
                }
            }
        },
        edit: {
            description: '✏️ Wish editing menu',
            actions: {
                title: '✏️ Change title',
                addDescription: '✏️ Add description',
                updateDescription: '✏️ Update description',
                addImages: '🌅 Add photos',
                updateImages: '🌅 Update photos',
                addLink: '🔗 Add link',
                updateLink: '🔗 Update link',
                priority: '🎯 Priority: {level}',
                imagesOrder: '🔀 Photo order',
                hide: '🫣 Hide from others',
                show: '👀 Show to others',
                addPrice: '💸 Add price',
                updatePrice: '💸 Update price'
            },
            scenes: {
                title: '✏️ Send the new title for your wish.\n{0} characters max.',
                addDescription:
                    '✏️ Send a description for this wish.\n{0} characters max.',
                updateDescription:
                    '✏️ Send a new description ({0} characters max) or ❌ remove it',
                addImages: '🌅 Send up to 9 photos',
                updateImages:
                    '🌅 Send new photos (up to 9) or ❌ remove them all',
                addLink: '🔗 Send a link',
                updateLink: '🔗 Send a new link or ❌ remove it',
                addPrice: '💸 Send the price',
                updatePrice: '💸 Send a new price or ❌ remove it',
                priceCurrency: 'Numbers only, in {0}.'
            },
            errors: {
                title: {
                    general: '❌ Invalid title!',
                    link: '❌ The title can’t contain a link!'
                },
                description: '❌ Invalid description!',
                removeImages: '❌ This wish has no photos.',
                updateImages: '❌ No photos in that message.',
                link: '❌ The link must start with http:// or https://',
                price: '❌ Invalid price!'
            },
            success: {
                title: '✅ Title updated!',
                removeDescription: '✅ Description removed!',
                updateDescription: '✅ Description updated!',
                removeImages: '✅ Photos removed!',
                updateImages: '✅ Photos added!',
                imagesLimit:
                    'ℹ️ Only 9 photos were saved: that’s the limit for one wish.',
                removeLink: '✅ Link removed!',
                updateLink: '✅ Link updated!',
                priority: '✅ Priority updated!',
                visibility: '✅ Visibility changed!',
                removePrice: '✅ Price removed!',
                updatePrice: '✅ Price updated!'
            },
            currency: {
                hint: 'Choose the currency for this wish. Current: {currency}.',
                success: '✅ Wish currency changed to {currency}'
            },
            images: {
                order: {
                    prompt: '🔀 Pick the photo that should come first. The first photo is the wish’s cover.',
                    caption: 'Photo {n}',
                    makeFirst: '⬆️ Make photo {n} first',
                    success: '✅ The photo order was changed!',
                    changed:
                        'ℹ️ The photos changed in the meantime, so the order wasn’t saved. Try again.'
                }
            }
        },
        remove: {
            confirm:
                '❓Did your wish come true?\n(Just for stats. It’ll be removed either way.)',
            success: '✅ Wish removed!'
        },
        clean: {
            error: '❌ The wish list is already empty!',
            success: '✅ Wish list cleared!',
            confirm:
                '❓<b>Clear your wish list?</b>\n\nAll wishes will be removed, and they’ll also disappear from other people’s <b>Gifts to give</b> lists. This can’t be undone.'
        },
        share: {
            success: '✅ Here’s the link to your wish list:\n{url}',
            empty: '❌ Nothing to share yet: your wish list is empty.\nAdd at least one wish first.',
            consent:
                '🌐 Before you share\n\nThe bot will create a public page for your wish list on {host}. It will show:\n• your Telegram name: {name}\n• your @username, only if you turn it on\n• all your wishes except hidden ones, with their photos\n• gifted wishes at the end of the list, unless you turn them off\n• your payment info, if you’ve added it and it’s turned on\n\nAnyone with the link can open the page, and it may show up in search results. Your phone number, delivery address, and “Gifts to give” list are never shown there. If you turn on your phone number and address, only people in Telegram see them.\n\nYou can stop sharing anytime.',
            ready: '✅ Your wish list is live!\n\n📲 Open in Telegram:\n{appUrl}\n\n🌐 Open in browser:\n{pageUrl}\n\nThe page updates automatically whenever you change your list.',
            stopConfirm:
                '❓ Stop sharing your wish list?\n\nThe page will go offline and your saved name will be deleted. If you share again later, the same link will work again, so anyone who has it will see your list again.',
            stopped:
                '✅ Done. You’re no longer sharing your wish list.\nThe link no longer works.',
            newConfirm:
                '❓ Create a new link?\n\nThe old link will stop working right away, and no one will be able to open your list with it. You’ll need to send the new link to your friends again.',
            rotated:
                '✅ Here are the new links to your wish list.\n\n📲 Open in Telegram:\n{appUrl}\n\n🌐 Open in browser:\n{pageUrl}\n\nThe old links no longer work.',
            pageEmpty:
                'ℹ️ The page is empty right now: there are no visible wishes on it. The link works, and wishes will show up as soon as you add them.',
            sendText:
                'My wish list ❤️ Pick a gift for me 🎁\n\n🌐 No Telegram? Open it in a browser:\n{pageUrl}',
            actions: {
                publish: '✅ Share',
                openTelegram: '📲 Open in Telegram',
                openBrowser: '🌐 Open in browser',
                send: '📤 Send to friends',
                stop: '🚫 Stop sharing',
                newLink: '🔄 New link',
                showUsername: '👤 Show my @username',
                hideUsername: '🙈 Hide my @username',
                showGifted: '🎁 Show gifted wishes',
                hideGifted: '🙈 Hide gifted wishes'
            },
            gifted: {
                shown: '🎁 Friends will now see the gifts you’ve already received at the end of your list.',
                hidden: '🙈 Friends no longer see your gifted wishes.'
            }
        }
    },
    giveList: {
        title: '🎁 Gifts to give',
        empty: 'Your <b>Gifts to give</b> list is empty for now. Wishes you reserve will show up here.\n🔎 Find someone’s wish list to reserve a wish.',
        filled: {
            before: '<b>Here are the wishes you’ve reserved:</b>',
            after: '❓<b>What would you like to do?</b>\n\n❌ Cancel a reservation.\n🧹 Clear your <b>Gifts to give</b> list.'
        },
        givers: '\n\n👥 <i>Others who reserved this: {0}</i>',
        owner: '\n\n👤 For: <b>{0}</b>',
        success: {
            remove: '✅ Reservation canceled. The wish was removed from your <b>Gifts to give</b> list!',
            clean: '✅ All reservations canceled. Your <b>Gifts to give</b> list is now empty!'
        },
        clean: {
            confirm:
                '❓<b>Clear your Gifts to give list?</b>\n\nAll your reservations will be canceled, and the wishes will disappear from this list.'
        }
    },
    findList: {
        title: '🔎 Find a wish list',
        description:
            'Search by username or phone number.\n\nCan’t find someone? They may not have used the bot yet, or may not have shared their number. Try their username instead.\n\n<b>Send me their username or phone number.</b>\n<i>@username or phone number with country code</i>',
        empty: 'This person hasn’t added any wishes yet.',
        filtered: 'No wishes match this filter.\nTry resetting it.',
        filled: {
            before: 'Here’s the wish list of <b>{0}</b>:',
            payments:
                'Can’t get a specific gift? They’ve shared how to send them money so they can buy it themselves:\n\n{0}',
            after: '❓<b>What would you like to do?</b>\n\n🎁 Reserve a wish\n❌ Cancel a reservation',
            contact: {
                title: '📇 <b>Contact and delivery</b>',
                phone: '📱 Phone: {phone}',
                address: '📦 Delivery address:\n{address}'
            }
        },
        givers: {
            you: '\n\n👥 <i>Reserved by you</i>',
            somebodyAndYou: '\n\n👥 <i>Reserved by you and {0} more</i>',
            somebody: '\n\n👥 <i>People who reserved this: {0}</i>'
        },
        actions: {
            give: '🎁 Reserve',
            take: '❌ Cancel reservation'
        },
        errors: {
            give: '❌ You’ve already reserved this!',
            take: '❌ You haven’t reserved this wish!',
            notFound:
                '❌ No one found. Check the username or number and try again.',
            foundYourself: '❌ Nice try! You can’t look yourself up 😘',
            tooLong:
                '❌ That search is too long! The limit is {0} characters. Try again.',
            rateLimited:
                '⏳ Too many searches in a row. Try again in a minute.',
            needsCountryCode:
                '❌ Add the country code to the number, e.g. +380501234567.'
        },
        success: {
            give: '✅ Reserved! The wish was added to your <b>Gifts to give</b> list.',
            take: '✅ Reservation canceled. The wish was removed from your <b>Gifts to give</b> list.'
        }
    },
    donate: {
        title: '💸 Support the author with a donation 🥹👉👈',
        description:
            'The bot will stay free for as long as possible, so that we Ukrainians can keep giving each other gifts.\nThis really matters, because we have each other!\n\nIf you’d like to support the author, you can use the services below or PayPal directly:\n{paypal}\n\nI’ll be truly grateful ❤️\n\nMost donations go to fundraisers for the Armed Forces of Ukraine.\nYou can find the fundraisers and reports in my Telegram channel via the link below.',
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
        action: '📊 Statistics',
        title: '📊 <b>Statistics</b>',
        users: '👤 Active users: <b>{0}</b>',
        wishes: '🎁 Wishes created (all time): <b>{0}</b>',
        done: '✅ Wishes fulfilled (all time): <b>{0}</b>'
    },
    contacts: {
        telegram: '🔗 Telegram channel'
    },
    share: {
        title: '{name}’s wish list'
    },
    markup: {
        title: '❤️ <b>{0}</b>',
        description: '\n\n✏️ Description:\n{0}',
        priority: {
            low: {
                owner: '\n\n<blockquote>🟢 <b>I kind of want this</b></blockquote>',
                watcher:
                    '\n\n<blockquote>🟢 <b>They kind of want this</b></blockquote>'
            },
            medium: {
                owner: '\n\n<blockquote>🟡 <b>I want this</b></blockquote>',
                watcher: '\n\n<blockquote>🟡 <b>They want this</b></blockquote>'
            },
            high: {
                owner: '\n\n<blockquote>❗️ <b>I really want this!</b></blockquote>',
                watcher:
                    '\n\n<blockquote>❗️ <b>They really want this!</b></blockquote>'
            }
        },
        hidden: '\n\n🫣 <i>This wish is hidden from others!</i>',
        price: '\n\n💸 Estimated price: <b>{0}</b>',
        approx: '≈ {0} ({1})',
        date: {
            created: '\n\n🗓 <i>Added: {0}</i>',
            updated: '\n🗓 <i>Updated: {0}</i>'
        }
    },
    payments: {
        title: {
            add: '💸 Add payment info',
            update: '💸 Update payment info'
        },
        description: {
            add: 'If someone can’t buy a gift from your list, they can send you money instead.\n\nAdd only what you’re OK with others seeing, for example:\n- PayPal\n- A Monobank Jar link\n- A card number\n- A Buy Me a Coffee or Ko-fi link{current}\n\n<b>Send your info in your next message.</b>',
            update: '<b>Your current payment info:</b>\n{0}'
        },
        edit: {
            error: '❌ That doesn’t look like valid info.\nTry again.',
            success: '✅ Payment info updated!',
            tooLong:
                '❌ That’s too long! The limit is {0} characters.\nTry again.'
        },
        remove: {
            success:
                '✅ Payment info removed! You can come back here anytime to add it again.'
        }
    },
    settings: {
        title: '⚙️ Settings',
        description:
            'Choose what to set up: language, currency, payment info, delivery address, or what others see.'
    },
    listImport: {
        entry: '📥 Import a wish list',
        title: '📥 Import a wish list',
        description:
            'Bring your wish list over from another service so you don’t have to add everything by hand. Pick where to import from.',
        disabled: 'Wish list import isn’t available right now.',
        sources: {
            rewish: '🔗 rewish.io'
        },
        prompt: 'Send a link to your wish list on rewish.io.\n\nThese links work:\n• <i>rewish.io/abc123</i> – a whole profile\n• <i>rewish.io/abc123/wishes?access_code=xyz</i> – a profile with an access code\n• <i>rewish.io/abc123/collection/123456?access_code=xyz</i> – one collection',
        cancel: '❌ Cancel',
        reading: '⏳ Reading the wish list…',
        preview: {
            title: '📥 <b>Found in the wish list</b>',
            active: '🎁 New wishes: {count}',
            gifted: '🎉 Gifted, going to “Gifted”: {count}',
            duplicates: '♻️ Already in your list, skipped: {count}',
            withoutPrice: '💸 No price (other currency): {count}',
            overLimit: '🚫 Over the 500-wish limit: {count}',
            photosNote: '🖼 Photos will load gradually, which can take a while.',
            savedNote:
                'ℹ️ rewish doesn’t return the owner’s hidden “saved” wishes for a link like this, so they won’t be included.',
            nothing: 'Nothing new: every wish is already in your list.',
            visibility:
                '👀 How should the wishes be imported? <b>Hidden</b> wishes are visible only to you, <b>public</b> ones are visible to everyone you share your list with.'
        },
        visibility: {
            hidden: '🫣 Hidden',
            public: '👀 Public',
            selected: '✅ {label}'
        },
        commit: '✅ Import',
        refresh: '🔄 Refresh',
        myWishes: '❤️ My wishes',
        progress: '⏳ Added {created} of {planned}…',
        done: {
            summary: '✅ Import finished! Wishes added: {created}.',
            gifted: 'Of them gifted: {gifted}.',
            photos: '🖼 Photos will load gradually.',
            photosLeft: '🖼 Photos still loading: {count}.'
        },
        failed: '❌ The import was interrupted. Wishes added: {created}.',
        cancelled: 'Import canceled.',
        failure: {
            invalidUrl:
                '❌ That doesn’t look like a rewish.io wish list link. Check it and send it again.',
            userNotFound:
                '❌ I couldn’t find that user on rewish.io. Check the link.',
            privateCollection:
                '🔒 This collection is private. Add the right access code (?access_code=…) to the link and try again.',
            schemaChanged:
                '⚠️ rewish.io seems to have changed its format, so I can’t read the list for now. Try again a bit later.',
            upstream:
                '⚠️ rewish.io is returning errors right now. Try again in a little while.',
            timeout:
                '⌛ rewish.io is taking too long to respond. Try again in a little while.',
            rateLimited:
                '⏳ Too many requests in a row. Try again in a minute or two.',
            empty: 'This list has no wishes that can be imported.',
            busy: '⏳ An import is already running. Wait for it to finish.',
            limitReached:
                '❌ Your list already has 500 wishes, so new ones can’t be added. Remove a few first.',
            expired: 'This preview has expired. Send the link again.'
        }
    },
    currency: {
        title: '💱 Currency',
        description:
            'Choose the currency for the prices of new wishes. Each wish keeps its own currency, and others see approximate amounts converted at the official daily rate.\n\nCurrent currency: <b>{current}</b>',
        options: {
            UAH: '🇺🇦 ₴ Hryvnia',
            USD: '🇺🇸 $ US dollar',
            EUR: '🇪🇺 € Euro',
            PLN: '🇵🇱 zł Złoty'
        },
        success: '✅ Currency changed to {currency}'
    },
    priority: {
        title: '🎯 Priority',
        levels: {
            none: '⚪ No priority',
            low: '🟢 Low',
            medium: '🟡 Medium',
            high: '🔴 High'
        },
        success: '✅ Priority changed to {level}'
    },
    delivery: {
        title: {
            add: '📦 Add delivery address',
            update: '📦 Update delivery address'
        },
        description:
            'Tell people where to send gifts, for example, your home address or a parcel locker. 5–300 characters, up to 6 lines, no links.{current}\n\n<b>Send the new address in your next message.</b>',
        phoneWarning:
            'ℹ️ Your address is shown to others only together with your phone number. You can turn this on in “What others see.”',
        errors: {
            tooShort: '❌ Not enough detail. Add a bit more.\nTry again.',
            tooLong:
                '❌ That address is too long! The limit is {max} characters.\nTry again.',
            containsLink: '❌ Links aren’t allowed in the address.\nTry again.',
            tooManyLines: '❌ Too many lines (6 max).\nTry again.'
        },
        success: {
            update: '✅ Delivery address saved!',
            remove: '✅ Delivery address removed! You can come back here anytime to add it again.'
        }
    },
    disclosure: {
        title: '👀 What others see',
        description:
            'Choose what others see when they open your wish list. Your phone number and delivery address are shown only in Telegram, never on the web page. Both are off by default.',
        toggle: {
            payments: {
                on: '✅ Payment info: shown',
                off: '🚫 Payment info: hidden'
            },
            phone: {
                on: '✅ Phone number: shown',
                off: '🚫 Phone number: hidden'
            },
            address: {
                on: '✅ Delivery address: shown',
                off: '🚫 Delivery address: hidden'
            }
        },
        confirm: {
            phone: '❓ Show your phone number?\n\nAnyone who opens your wish list in Telegram will see it, whether through your link or by searching for your username or number. It’s never shown on the web page. Messages already sent stay in the recipient’s chat.',
            address:
                '❓ Show your delivery address?\n\nAnyone who opens your wish list in Telegram will see it, whether through your link or by searching for your username or number. It’s shown only together with your phone number, and never on the web page. Messages already sent stay in the recipient’s chat.',
            both: '❓ Show your delivery address together with your phone number?\n\nWe’ll show your address only together with your phone number, because it’s no use without one. Anyone who opens your list in Telegram will see both, whether through your link or by searching for your username or number. Neither is ever shown on the web page. Messages already sent stay in the recipient’s chat.'
        },
        needsAddress: '❌ Add a delivery address first.',
        phoneMissing:
            '❌ The bot doesn’t have your phone number. First, let others find you by phone number in “Change visibility.”',
        saved: '✅ Settings saved!',
        indexing: {
            title: 'Show in search engines',
            hint: 'When this is on, Google and other search engines may show your wish list page, including any payment info on it. Turning it off adds noindex to the page, but copies that are already indexed may take a while to disappear.',
            on: '✅ Search engines: allowed',
            off: '🚫 Search engines: blocked'
        }
    },
    filters: {
        title: '💰 Filter by price',
        description: 'Show only wishes in your price range.',
        applied: '\n\nPrice filter applied:\n<b>{0}</b>',
        fromTo: 'From {0} to {1}',
        from: 'From {0}',
        to: 'Up to {0}',
        reset: '❌ Reset filter',
        success: {
            reset: '✅ Filter reset!',
            set: '✅ Filter set!'
        }
    },
    pagination: {
        range: 'Showing {0}–{1} of {2}'
    },
    releases: {
        labels: {
            added: 'Added',
            updated: 'Changed',
            fixed: 'Fixed',
            removed: 'Removed',
            notes: 'Notes'
        },
        announcement: {
            title: 'The bot is now on version {version} 🎉',
            footer: 'All changes and previous versions: /releases'
        },
        empty: 'No release notes yet.'
    },
    web: {
        header: {
            count: '{count} {{count:wish|wishes}}',
            summary: '{count} {{count:wish|wishes}}, updated {date}',
            username: 'Telegram: @{username}',
            lead: 'Wish list from',
            fallback: 'Wish list'
        },
        payments: {
            title: 'Prefer to send money?'
        },
        wish: {
            priority: {
                low: 'Kind of wants this',
                medium: 'Wants this',
                high: 'Really wants this'
            },
            price: 'Estimated price:',
            approx: '≈ {amount}',
            original: '(listed as {amount})',
            link: 'Open on {host}',
            photo: 'Photo {index} of {total}',
            photos: 'Photos, {count}',
            photoCount: '{count} {{count:photo|photos}}',
            details: 'More details',
            created: 'Added {date}',
            updated: 'Added {created}, updated {updated}',
            gifted: 'Gifted'
        },
        empty: 'Nothing here yet. Wishes will show up as soon as they’re added.',
        truncated: 'Showing the first {limit} wishes.',
        ratesNote:
            'Prices are approximate, converted to {currency} at the official daily rate as of {date}.',
        footer: {
            cta: 'Create your own wish list',
            support: 'Support the author',
            openSource: 'Open source on GitHub',
            openInApp: 'Open in Telegram and reserve a wish'
        },
        currency: {
            label: 'Currency',
            auto: 'Auto',
            UAH: '₴ Hryvnia',
            USD: '$ US dollar',
            EUR: '€ Euro',
            PLN: 'zł Złoty'
        },
        delivery: {
            inTelegram: 'Delivery details are available in Telegram',
            cta: 'Open in Telegram'
        },
        language: {
            label: 'Language'
        },
        theme: {
            label: 'Theme',
            system: 'System',
            light: 'Light theme',
            dark: 'Dark theme'
        },
        notFound: {
            title: 'Page not found',
            description:
                'This wish list doesn’t exist, or the link is out of date.',
            cta: 'Open the bot'
        },
        gone: {
            title: 'This wish list is no longer shared',
            description:
                'The owner stopped sharing this list. If they share it again, this link will work again.'
        },
        meta: {
            description: '{name}’s wish list: {count} {{count:wish|wishes}}'
        },
        home: {
            title: 'Wishlist: a Telegram bot for wish lists and gift ideas',
            description:
                'Collect your wishes in a Telegram bot, share one link, and your friends and family will give you exactly what you want. Free, in English, Ukrainian, and Polish.',
            name: 'Wishlist',
            tagline:
                'Keep your wishes in Telegram, share a link, and let your friends and family pick a gift you actually want.',
            cta: 'Open {bot}',
            note: 'Free. All you need is Telegram.',
            steps: {
                title: 'How it works',
                create: {
                    title: 'Create your list in the bot',
                    text: 'Add wishes with a title, a description, up to 9 photos, a price, and a link to the store.'
                },
                share: {
                    title: 'Share a link',
                    text: 'The bot makes a public page of your list. Send the link to friends, or let them find you in the bot by username or phone number.'
                },
                give: {
                    title: 'Friends reserve a wish',
                    text: 'They tap “Reserve,” and the wish lands on their “Gifts to give” list. Other friends can see it’s taken, but you can’t, so the surprise stays a surprise.'
                }
            },
            features: {
                title: 'What the bot can do',
                photos: {
                    title: 'Photos and links',
                    text: 'Up to 9 photos per wish and a link to the store, so no one gets the wrong model or color.'
                },
                prices: {
                    title: 'Prices and filters',
                    text: 'Set a price, and friends see it in their own currency and can filter your wishes by their budget.'
                },
                priority: {
                    title: 'Priorities',
                    text: 'Mark what you want most: those wishes get a heart.'
                },
                hidden: {
                    title: 'Hidden wishes',
                    text: 'Keep drafts and personal things to yourself: only you can see hidden wishes.'
                },
                page: {
                    title: 'A page for friends',
                    text: 'All your wishes on one page that opens without Telegram. It updates automatically.'
                },
                search: {
                    title: 'Find friends',
                    text: 'Find other lists by username or phone number, if their owners allow it.'
                },
                languages: {
                    title: 'Three languages',
                    text: 'English, Ukrainian, and Polish, or automatic, following your Telegram language.'
                }
            },
            privacy: {
                title: 'Privacy',
                phone: 'Your phone number is never on the web: by default it is only used for search, and only you decide whether people in Telegram see it.',
                name: 'Your name appears on the page only after you agree, and disappears as soon as you stop sharing.',
                openSource:
                    'The code is open source under AGPL-3.0, so anyone can check how the bot handles data.'
            },
            links: {
                title: 'More from the author',
                author: 'The author on X',
                princess: 'Another bot by the author: Princess of the Day'
            }
        }
    },
    commands: {
        start: 'Main menu',
        lang: 'Change the bot language',
        releases: 'What’s new',
        app: 'Open app'
    },
    appEntry: {
        text: '📱 The Wishlist app opens right inside Telegram. It does everything the chat does: add wishes with photos, find friends’ lists, and reserve wishes.'
    },
    app: {
        common: {
            appName: 'Wishlist',
            loading: 'Loading…',
            retry: 'Try again',
            cancel: 'Cancel',
            undo: 'Undo',
            save: 'Save',
            saving: 'Saving…',
            send: 'Send',
            sending: 'Sending…',
            remove: 'Remove',
            close: 'Close',
            back: 'Back',
            toHome: 'Home',
            done: 'Done',
            confirm: 'Confirm',
            yes: 'Yes',
            no: 'No',
            open: 'Open',
            copy: 'Copy',
            copied: 'Copied',
            showMore: 'Show more',
            moreActions: 'More actions',
            optional: 'Optional',
            counter: '{count} of {max}',
            charactersLeft: '{count} {{count:character|characters}} left',
            limitReached: 'Character limit reached',
            notSet: 'Not set',
            on: 'On',
            off: 'Off',
            newBadge: 'New'
        },
        a11y: {
            priority: {
                low: 'Kind of want this',
                medium: 'Want this',
                high: 'Really want this'
            },
            priorityThird: 'Really wants this',
            hidden: 'Hidden wish, only you can see it',
            photo: 'Photo {index} of {total}: {title}',
            photos: 'Photos, {count}',
            photoPlaceholder: 'No photo',
            menu: 'Menu',
            closeToast: 'Dismiss',
            countdown: {
                started:
                    'This happens in {seconds} {{seconds:second|seconds}}. Tap Cancel to stop it.',
                cancelled: 'Canceled'
            },
            mainNavigation: 'Main navigation',
            externalLink: 'Opens in browser'
        },
        toasts: {
            saved: 'Saved',
            removed: 'Removed',
            copied: 'Copied',
            undoUnavailable: 'This can’t be undone'
        },
        errors: {
            generic: 'Something went wrong. Try again.',
            network:
                'Couldn’t connect. Check your internet connection and try again.',
            unauthorized: 'Your session has expired. Open the app again.',
            forbidden: 'You can’t do that.',
            previewAccessDenied:
                'This test version is available to the author only.',
            registrationRequired:
                'Choose how others can find you first, then try again.',
            tokenInvalid:
                'You no longer have access to this list. Search for the person again.',
            tokenExpired:
                'Access to this list has expired. Search for the person again.',
            notFound: 'This wish no longer exists.',
            listUnavailable: 'This wish list isn’t available right now.',
            shareGone: 'This wish list is no longer shared.',
            conflict: 'Something changed. Refresh and try again.',
            shareEmpty:
                'Nothing to share yet: add at least one wish that others can see.',
            notShared: 'You’re not sharing your wish list right now.',
            imagesFull: 'A wish can have up to 9 photos.',
            wishLimit:
                'Your wish list is full (500 wishes max). Remove a few first.',
            imageChanged: 'The photos changed. Refresh and try again.',
            ownWish: 'You can’t reserve your own wish.',
            writeAccessRequired:
                'Allow the bot to message you so it can save photos.',
            payloadTooLarge: 'The file is too large. Pick a smaller one.',
            unsupportedMedia:
                'This format isn’t supported. Pick a JPEG, PNG, or WebP photo.',
            validation: 'Fix the highlighted fields.',
            rateLimited:
                'Too many actions in a row. Try again in {seconds} {{seconds:second|seconds}}.',
            upstream: 'Telegram isn’t responding right now. Try again later.',
            notDelivered: 'Couldn’t send your feedback. Try again later.',
            disabled: 'The app is temporarily unavailable.',
            internal: 'Something went wrong on our end. Try again.',
            notImplemented: 'This feature isn’t available yet.'
        },
        fieldErrors: {
            required: 'This field is required.',
            empty: 'This field can’t be empty.',
            tooLong: 'Too many characters: {max} at most.',
            tooShort: 'Not enough details yet: add a little more.',
            tooManyLines: 'Too many lines.',
            containsLink:
                'The title can’t contain a link. Put it in the Link field.',
            invalid: 'This value isn’t valid.',
            usernameRequired:
                'You don’t have a Telegram username. Add one in Telegram settings and come back.',
            usernameUnavailable:
                'To show your username, let people find you by username first.',
            phoneRequired:
                'A phone number is needed: let others find you by phone number in Visibility.',
            addressRequired: 'Add a delivery address first.'
        },
        outside: {
            title: 'Open in Telegram',
            text: 'This app works inside Telegram. Open it from the bot to see your wish list.',
            cta: 'Open in Telegram'
        },
        expired: {
            title: 'Session expired',
            text: 'The app has been open for too long. Close it and open it again.',
            cta: 'Close app'
        },
        unavailable: {
            title: 'The app is temporarily unavailable',
            text: 'We’re on it. In the meantime, you can use the bot in chat.',
            cta: 'Open the bot'
        },
        previewOnly: {
            title: 'Test version',
            text: 'This version of the app is open to the author only. Please use the main bot.',
            cta: 'Open the bot'
        },
        unsupported: {
            title: 'Telegram needs an update',
            text: 'Your Telegram version doesn’t support this app. Update Telegram or use the bot in chat.',
            cta: 'Open the bot'
        },
        bootError: {
            title: 'The app couldn’t start',
            text: 'Try opening it again. If that doesn’t help, the bot in chat works as usual.',
            cta: 'Try again'
        },
        offline: {
            text: 'No connection. Showing the last loaded data.',
            cta: 'Try again'
        },
        nav: {
            home: 'Home',
            wishes: 'My wishes',
            gives: 'Gifts to give',
            find: 'Find a list',
            share: 'Share',
            settings: 'Settings',
            visibility: 'Visibility',
            payments: 'Payment info',
            language: 'Language',
            feedback: 'Send feedback',
            stats: 'Statistics',
            donate: 'Support the author',
            releases: 'What’s new',
            about: 'About',
            currency: 'Currency',
            delivery: 'Delivery address',
            listImport: 'Import a wish list'
        },
        contact: {
            title: 'Contact details',
            phone: 'Phone',
            address: 'Delivery address',
            copy: 'Copy',
            copied: 'Copied',
            call: 'Call'
        },
        currency: {
            title: 'Currency',
            lead: 'Choose the currency for the prices of new wishes. Each wish keeps its own currency, and others see approximate amounts at the official daily rate.',
            options: {
                UAH: {
                    title: 'Hryvnia (₴)',
                    hint: 'Currency code: UAH'
                },
                USD: {
                    title: 'US dollar ($)',
                    hint: 'Currency code: USD'
                },
                EUR: {
                    title: 'Euro (€)',
                    hint: 'Currency code: EUR'
                },
                PLN: {
                    title: 'Złoty (zł)',
                    hint: 'Currency code: PLN'
                }
            }
        },
        delivery: {
            title: 'Delivery address',
            lead: 'Where gifts should be sent, for example, your home address or a parcel locker. Others see the address only in Telegram, and only if you turn it on.',
            label: 'Delivery address',
            placeholder: 'For example, 123 Main St, Apt 4, Springfield',
            hint: '5–300 characters, up to 6 lines, no links.',
            phoneWarning:
                'Your address is shown only together with your phone number. You can turn this on in “Share your list.”',
            save: 'Save',
            remove: 'Remove address',
            saved: 'Delivery address saved',
            removed: 'Delivery address removed',
            errors: {
                tooManyLines: 'Up to 6 lines.',
                containsLink: 'Links aren’t allowed in the address.'
            }
        },
        home: {
            title: 'Wishlist',
            heroTitle: 'Your wish list',
            wishesCount: '{count} {{count:wish|wishes}}',
            givesCount: '{count} {{count:gift|gifts}} planned',
            addWish: 'Add a wish',
            themeToggle: 'Theme: {current}. Change',
            pairs: {
                stats: 'Stats',
                donate: 'Donate',
                feedback: 'Feedback',
                releases: 'What’s new',
                about: 'About'
            },
            tiles: {
                wishes: {
                    title: 'My wishes',
                    text: 'Add and edit your wishes'
                },
                gives: {
                    title: 'Gifts to give',
                    text: 'Wishes you’ve reserved for others'
                },
                find: {
                    title: 'Find a list',
                    text: 'By username or phone number'
                },
                share: {
                    title: 'Share',
                    text: 'A public page for your list'
                }
            },
            groups: {
                settings: 'Settings',
                about: 'About the project'
            },
            guest: {
                title: 'Welcome to Wishlist',
                lead: 'Write down your wishes, share a link, and let your friends and family pick a gift you actually want.',
                stepsTitle: 'How it works',
                steps: {
                    create: {
                        title: 'Make your list',
                        text: 'Add wishes with a title, a description, up to 9 photos, a price, and a store link.'
                    },
                    share: {
                        title: 'Share the link',
                        text: 'Send friends a link to your page or let them find you by username or phone number.'
                    },
                    give: {
                        title: 'Friends reserve a wish',
                        text: 'Friends see which wishes are already reserved. You don’t, so the surprise stays a surprise.'
                    }
                },
                cta: 'Get started',
                note: 'To create your list, choose how others can find you. It only takes a minute.'
            }
        },
        wishes: {
            title: 'My wishes',
            count: '{count} {{count:wish|wishes}}',
            add: 'Add a wish',
            empty: {
                title: 'Nothing here yet',
                text: 'Add your first wish and it will show up here.',
                cta: 'Add a wish'
            },
            filteredEmpty: {
                title: 'Nothing found',
                text: 'No wishes match this filter.',
                cta: 'Reset filter'
            },
            hiddenBadge: 'Only you can see this',
            priorityToggle: 'High priority',
            hiddenToggle: 'Hide from others',
            photoCount: 'Photos: {count}',
            edit: 'Edit',
            menu: {
                clean: 'Clear list'
            },
            clean: {
                title: 'Clear your wish list?',
                text: 'All wishes will be removed and will disappear from other people’s “Gifts to give” lists. This can’t be undone.',
                confirm: 'Clear',
                success: 'Wish list cleared',
                empty: 'Your wish list is already empty'
            },
            toasts: {
                priorityChanged: 'Priority: {level}',
                priorityRemoved: 'Priority removed',
                hidden: 'Now only you can see this wish',
                shown: 'Now others can see this wish'
            }
        },
        gifted: {
            band: 'Gifted',
            date: 'Gifted on {date}',
            restore: 'Back to my wishes',
            hide: 'Hide forever for everyone',
            hideHint:
                'Neither you nor your friends will see it. It still counts toward your stats.',
            restored: 'The wish is back on your list',
            hidden: 'Hidden'
        },
        money: {
            approx: '≈ {amount}',
            original: '(listed as {amount})'
        },
        filters: {
            title: 'Filter by price',
            all: 'All',
            upTo: 'Up to {amount}',
            from: 'From {amount}',
            range: 'From {from} to {to}',
            reset: 'Reset filter',
            applied: 'Filter: {label}'
        },
        editor: {
            createTitle: 'New wish',
            editTitle: 'Edit wish',
            requiredMark: 'required',
            titleMissing: 'Add a title for your wish',
            fixFields: 'Fix the highlighted fields: {count}',
            title: {
                label: 'Title',
                hint: 'Briefly, what do you want?',
                placeholder: 'For example, Carcassonne board game'
            },
            description: {
                label: 'Description',
                hint: 'Size, color, model: anything that helps get it right.',
                placeholder: 'Details worth knowing'
            },
            price: {
                label: 'Estimated price',
                hint: 'Numbers only, in {currency}.',
                placeholder: '50'
            },
            link: {
                label: 'Link',
                hint: 'A store link that starts with https://',
                placeholder: 'https://',
                host: 'Opens on {host}'
            },
            priority: {
                label: 'Priority',
                hint: 'The higher the priority, the higher the wish appears on your list. Only high-priority wishes get a heart.',
                levels: {
                    none: 'None',
                    low: 'Low',
                    medium: 'Medium',
                    high: 'High'
                }
            },
            currency: {
                label: 'Currency'
            },
            hidden: {
                label: 'Hide from others',
                hint: 'Only you can see a hidden wish.'
            },
            errors: {
                titleEmpty: 'Give your wish a title.',
                titleTooLong:
                    'The title is too long: {max} characters at most.',
                titleContainsLink:
                    'The title can’t contain a link. Put it in the Link field.',
                descriptionTooLong:
                    'The description is too long: {max} characters at most.',
                priceInvalid: 'Enter the price as a number, for example, 50.',
                linkInvalid: 'The link must start with http:// or https://.'
            },
            create: 'Add wish',
            save: 'Save',
            created: 'Wish added',
            saved: 'Changes saved',
            createdAt: 'Added {date}',
            updatedAt: 'Updated {date}',
            remove: {
                action: 'Remove wish',
                title: 'Did your wish come true?',
                text: 'This is just for stats: the wish will be removed either way.',
                done: 'Yes, it did',
                notDone: 'Just remove it',
                success: 'Wish removed'
            },
            discard: {
                title: 'Discard changes?',
                text: 'Unsaved changes will be lost.',
                confirm: 'Discard',
                keep: 'Keep editing'
            }
        },
        photos: {
            title: 'Photos',
            hint: 'Up to {max} photos. The first one is the cover.',
            count: '{count} of {max}',
            add: 'Add photos',
            remove: 'Remove photo',
            removeAll: 'Remove all photos',
            uploading: 'Uploading photos…',
            progress: '{done} of {total} uploaded',
            uploaded: 'Photo added',
            duplicate: 'You’ve already added this photo',
            failed: 'Couldn’t upload photo',
            full: 'You can add up to {max} photos',
            tooLarge: 'The photo is too large',
            unsupported: 'This format is not supported',
            queued: 'Photos will upload after you save',
            removed: 'Photo removed',
            reorder: {
                handle: 'Drag to reorder the photo',
                makeFirst: 'Make first',
                instructions:
                    'Press and hold a photo, then drag it to change the order. The first photo becomes the cover.',
                moved: 'Photo {position} of {total}',
                saved: 'Photo order saved',
                conflict: 'The photos changed. Refresh and try again.'
            },
            chatFallback: {
                action: 'Add photos in chat',
                hint: 'If photos won’t upload here, send them to the bot in chat.',
                sent: 'Send your photos to the bot in chat'
            },
            writeAccess: {
                title: 'Permission needed',
                text: 'To save photos, the bot sends them to you in chat. Allow the bot to message you.',
                allow: 'Allow'
            }
        },
        linkImport: {
            title: 'Add a wish',
            hint: 'Paste a product link, and we’ll try to fill in the rest for you.',
            urlLabel: 'Product link',
            urlPlaceholder: 'https://…',
            paste: 'Paste',
            continue: 'Continue',
            withoutLink: 'Add without a link',
            loading: 'Looking for the product on {host}…',
            filledFrom: 'Filled in from {host}. Check it before saving.',
            filledPartial:
                'Found only some details on {host}. Check and fill in the rest.',
            sourcePrice: 'Price on the site: {price}',
            photosFailed: 'Couldn’t load the photos. Add them manually.',
            photosUnsupported:
                'Some photos are in an unsupported format. Add them manually.',
            errors: {
                invalidUrl:
                    'That doesn’t look like a product link. Check it and try again.',
                blocked:
                    'The store didn’t share its data. Fill in the wish manually.',
                notProduct:
                    'Couldn’t read the page. Fill in the wish manually.',
                timeout:
                    'The page is taking too long to respond. Fill in the wish manually.',
                rateLimited:
                    'Too many requests to this store. Fill in the wish manually or try again later.',
                disabled:
                    'Filling in from a link isn’t available right now. Fill in the wish manually.'
            }
        },
        listImport: {
            title: 'Import a wish list',
            hint: 'Bring your wish list over from another service so you don’t have to add everything by hand.',
            sourceLabel: 'Import from',
            sources: {
                rewish: 'rewish.io'
            },
            urlLabel: 'Wish list link',
            urlPlaceholder: 'https://rewish.io/…',
            urlHint:
                'A profile link, a profile link with an access code, or a link to one collection all work.',
            paste: 'Paste',
            continue: 'Continue',
            loading: 'Reading the wish list…',
            preview: {
                title: 'Found in the wish list',
                active: 'New wishes: {count}',
                gifted: 'Gifted, going to “Gifted”: {count}',
                duplicates: 'Already in your list, skipped: {count}',
                withoutPrice: 'No price (other currency): {count}',
                overLimit: 'Over the 500-wish limit: {count}',
                photosNote:
                    'Photos will load gradually, which can take a while.',
                savedNote:
                    'rewish doesn’t return the owner’s hidden “saved” wishes for a link like this, so they won’t be included.',
                nothing: 'Nothing new: every wish is already in your list.'
            },
            visibility: {
                label: 'How to import the wishes',
                hidden: 'Hidden',
                hiddenHint: 'Only you will see them.',
                public: 'Public',
                publicHint: 'Everyone you share your list with will see them.'
            },
            start: 'Import',
            progress: {
                title: 'Importing wishes',
                text: 'Added {created} of {planned}',
                photos: 'Photos will load gradually. You can close the app, the import keeps going.'
            },
            done: {
                title: 'Import finished',
                text: 'Wishes added: {created}',
                gifted: 'Of them gifted: {gifted}',
                photosLeft: 'Photos still loading: {count}',
                cta: 'My wishes'
            },
            failed: {
                title: 'Import interrupted',
                text: 'Wishes added: {created}',
                retry: 'Try again'
            },
            toast: 'Wishes imported: {count}',
            failure: {
                invalidUrl:
                    'That doesn’t look like a rewish.io wish list link. Check it and try again.',
                userNotFound:
                    'We couldn’t find that user on rewish.io. Check the link.',
                privateCollection:
                    'This collection is private. Add the right access code (?access_code=…) to the link and try again.',
                schemaChanged:
                    'rewish.io seems to have changed its format, so we can’t read the list for now. Try again a bit later.',
                upstream:
                    'rewish.io is returning errors right now. Try again in a little while.',
                timeout:
                    'rewish.io is taking too long to respond. Try again in a little while.',
                rateLimited:
                    'Too many requests in a row. Try again in a minute or two.',
                empty: 'This list has no wishes that can be imported.',
                busy: 'An import is already running. Wait for it to finish.',
                limitReached:
                    'Your list already has 500 wishes, so new ones can’t be added. Remove a few first.',
                expired: 'This preview has expired. Paste the link again.'
            }
        },
        gives: {
            title: 'Gifts to give',
            count: '{count} {{count:gift|gifts}}',
            empty: {
                title: 'Nothing here yet',
                text: 'Wishes you reserve will appear here. Find a friend’s wish list and pick something to give.',
                cta: 'Find a list'
            },
            owner: 'For {owner}',
            others: 'Also reserved by {count} {{count:person|people}}',
            open: 'Open',
            remove: 'Cancel reservation',
            removed: 'Reservation canceled',
            clean: {
                action: 'Clear list',
                success: 'List cleared'
            }
        },
        find: {
            title: 'Find a wish list',
            label: 'Username or phone number',
            placeholder: '@username or phone number with country code',
            hint: 'You can find people who use the bot and allow others to find them.',
            submit: 'Find',
            searching: 'Searching…',
            errors: {
                empty: 'Enter a username or a phone number.',
                notFound: 'No one found. Check the username or phone number.',
                self: 'That’s your own list 😉 It’s under “My wishes.”',
                tooLong: 'Your search is too long: {max} characters max.',
                needsCountryCode:
                    'Add the country code to the number, e.g. +380501234567.'
            },
            reasons: {
                title: 'Why someone might not show up',
                notUser: 'They haven’t used the bot yet.',
                phoneHidden:
                    'They haven’t shared a phone number with the bot. Try their username instead.'
            }
        },
        third: {
            title: 'Wish list',
            lead: 'Wish list of {label}',
            count: '{count} {{count:wish|wishes}}',
            empty: 'This person hasn’t added any wishes yet.',
            filteredEmpty: 'No wishes match this filter.',
            priority: 'Really wants this',
            openLink: 'Open on {host}',
            givers: {
                you: 'Reserved by you',
                somebodyAndYou:
                    'Reserved by you and {count} more {{count:person|people}}',
                somebody: 'Reserved by {count} {{count:person|people}}'
            },
            give: 'Reserve',
            take: 'Cancel reservation',
            given: 'Reserved',
            taken: 'Reservation canceled',
            viewOnly:
                'You can only view this list. To reserve a wish, search for the person by username or phone number.',
            searchAgain: 'Search again',
            payments: {
                title: 'Prefer to send money?',
                text: 'If you can’t buy a specific gift, you can send money using the info below so they can buy it themselves.'
            }
        },
        share: {
            title: 'Share your list',
            empty: {
                title: 'Nothing to share yet',
                text: 'The page shows only wishes that others can see. Add at least one.',
                cta: 'Add a wish'
            },
            consent: {
                title: 'Before you share',
                lead: 'The bot will create a public page for your wish list on {host}. It will show:',
                name: 'your Telegram name: {name}',
                username: 'your @username, only if you turn it on',
                wishes: 'all wishes except hidden ones, with their photos',
                gifted: 'gifted wishes at the end of the list, unless you turn them off',
                payments:
                    'your payment info, if you’ve added it and it’s turned on',
                public: 'Anyone with the link can open the page, and it may show up in search results.',
                private:
                    'Your phone number, delivery address, and “Gifts to give” list are never shown there.',
                stop: 'You can stop sharing anytime.'
            },
            details: {
                title: 'What others see',
                lead: 'Choose what people see when they open your list in Telegram. Your phone number and delivery address never appear on the web page.',
                payments: {
                    label: 'Payment info',
                    hint: 'People who open your list will see how to send you money.'
                },
                phone: {
                    label: 'Phone number',
                    hint: 'Only in Telegram, never on the web page.'
                },
                address: {
                    label: 'Delivery address',
                    hint: 'Only in Telegram, and only together with your phone number.'
                },
                confirm: {
                    phone: 'Anyone who opens your list in Telegram will see your phone number, whether through your link or by searching for your username or number. It’s never shown on the web page. Messages already sent stay in the recipient’s chat.',
                    address:
                        'Anyone who opens your list in Telegram will see your delivery address, whether through your link or by searching for your username or number. It’s shown only together with your phone number, and never on the web page. Messages already sent stay in the recipient’s chat.',
                    both: 'We’ll show your address only together with your phone number, because it’s no use without one. Anyone who opens your list in Telegram will see both, whether through your link or by searching for your username or number. Neither is ever shown on the web page. Messages already sent stay in the recipient’s chat.'
                },
                phoneMissing:
                    'First, let others find you by phone number in Visibility.',
                addressMissing: 'Add a delivery address first.'
            },
            indexing: {
                title: 'Show in search engines',
                hint: 'When this is on, Google and other search engines may show your wish list page, including any payment info on it. Turning it off adds noindex to the page, but copies that are already indexed may take a while to disappear.'
            },
            publish: 'Share',
            published: 'Your wish list is now shared',
            link: {
                title: 'Your link',
                copy: 'Copy',
                copied: 'Link copied',
                send: 'Send to friends',
                open: 'Open page',
                appTitle: 'Link for Telegram',
                openApp: 'Open in Telegram',
                appHint:
                    'Opens your list right in Telegram, where friends can reserve a wish right away.',
                webTitle: 'Web page',
                webHint: 'For people who don’t use Telegram.'
            },
            sendText: 'My wish list ❤️ Pick a gift for me 🎁',
            sendBrowserHint: '🌐 No Telegram? Open it in a browser:',
            autoUpdate:
                'The page updates automatically whenever you change your list.',
            pageEmpty:
                'The page is empty right now: there are no visible wishes. They’ll show up as soon as you add them.',
            username: {
                label: 'Show my @username',
                hint: 'Friends will be able to message you on Telegram.',
                shown: 'Your @username is now on the page',
                hidden: 'Your @username is no longer on the page'
            },
            gifted: {
                label: 'Show gifted wishes',
                hint: 'Friends will see the gifts you’ve already received at the end of your list',
                shown: 'Friends can now see your gifted wishes',
                hidden: 'Friends no longer see your gifted wishes'
            },
            rotate: {
                action: 'New link',
                title: 'Create a new link?',
                text: 'The old link stops working right away. You’ll need to send the new one to your friends again.',
                confirm: 'Create',
                success: 'New link created. The old one no longer works.'
            },
            stop: {
                action: 'Stop sharing',
                title: 'Stop sharing?',
                text: 'The page will go offline and your saved name will be deleted. If you share again, the same link will work.',
                confirm: 'Stop sharing',
                success: 'You’re no longer sharing your wish list'
            }
        },
        payments: {
            title: 'Payment info',
            lead: 'If someone wants to give you something from your list but can’t buy it, they can send you money instead.',
            label: 'How to send you money',
            hint: 'PayPal, a Monobank Jar, a card number, or a Buy Me a Coffee link. Add only what you’re OK with others seeing.',
            placeholder: 'For example, your PayPal.me link',
            preview: 'This is how others will see it',
            empty: 'No payment info yet.',
            save: 'Save',
            saved: 'Payment info saved',
            errors: {
                tooShort: 'Not enough details yet: add a little more.',
                tooLong: 'Too many characters: {max} at most.'
            },
            remove: {
                action: 'Remove payment info',
                success: 'Payment info removed'
            }
        },
        visibility: {
            title: 'Visibility',
            guestTitle: 'Sign up',
            lead: 'How would you like others to find you?',
            later: 'You can change this anytime.',
            current: 'Right now people can find you',
            currentNone: 'Right now no one can find you.',
            options: {
                username: {
                    title: 'By username only',
                    hint: 'If you change your username in Telegram, it updates here automatically.'
                },
                phone: {
                    title: 'By phone number only',
                    hint: 'By default, no one sees your number: it’s used only for search.'
                },
                both: {
                    title: 'By username and phone number',
                    hint: 'People can find you either way.'
                }
            },
            values: {
                username: 'By username',
                phone: 'By phone number',
                both: 'By username and phone number'
            },
            usernameMissing:
                'You don’t have a Telegram username. Add one in Telegram settings so people can find you by it.',
            yourUsername: 'Your username: @{username}',
            yourPhone: 'Your number: {phone}',
            save: 'Save',
            shareNumber: 'Share my number',
            phoneHint:
                'Telegram will ask you to confirm sharing your number. No typing needed.',
            waiting: 'Waiting for your number…',
            cancelled: 'Number not shared',
            timeout: 'We didn’t get your number. Try again.',
            success: {
                guest: 'Done! People can find you now',
                user: 'Visibility updated'
            }
        },
        language: {
            title: 'Language',
            lead: 'Choose the app language. The bot in chat will use it too.',
            names: {
                uk: 'Ukrainian',
                en: 'English',
                pl: 'Polish'
            },
            native: {
                uk: 'Українська',
                en: 'English',
                pl: 'Polski'
            },
            auto: 'Auto',
            autoHint: 'Same as Telegram: {language}',
            saved: 'Language changed'
        },
        feedback: {
            title: 'Feedback',
            lead: 'Tell me what you think: what you like, what’s broken, what could be better, or offer to help translate.',
            contactHint:
                'If you’d like a reply, leave a contact: a username, phone number, or email.',
            label: 'Message',
            placeholder: 'Your feedback',
            send: 'Send',
            errors: {
                empty: 'Write at least a few words.',
                tooLong: 'The feedback is too long: {max} characters at most.'
            },
            success: {
                title: 'Thank you for the feedback!',
                text: 'I’ll read it as soon as I can.',
                another: 'Send another'
            }
        },
        stats: {
            title: 'Statistics',
            users: 'Active users',
            wishes: 'Wishes created (all time)',
            done: 'Wishes fulfilled (all time)'
        },
        donate: {
            title: 'Support the author',
            lead: 'The bot will stay free for as long as possible so that we can keep giving each other gifts. If you’d like to support the author, pick a service you like.',
            note: 'Most donations go to fundraisers for the Armed Forces of Ukraine. The fundraisers and reports are in the author’s Telegram channel.',
            services: 'Services',
            channel: 'The author’s Telegram channel',
            thanks: 'Thank you so much ❤️'
        },
        releases: {
            title: 'What’s new',
            version: 'Version {version}',
            date: 'Released {date}',
            empty: 'No release notes yet.',
            showMore: 'Earlier versions'
        },
        about: {
            title: 'About',
            lead: 'Wishlist helps you collect wishes and pick gifts people actually want.',
            privacy: {
                title: 'Privacy',
                storage:
                    'Your data is stored securely on Cloudflare. The bot keeps only your username and, if you allow it, your phone number.',
                phone: 'Your phone number is used to find your list. Others see it only in Telegram, and only if you turn it on in “What others see”.',
                name: 'Your Telegram name appears on the public page only after you agree, and disappears as soon as you stop sharing.',
                photos: 'Wish photos are visible only to the people you show your list to.',
                rates: 'Prices in other currencies are converted at the official daily rates of the National Bank of Ukraine.'
            },
            openSource: {
                title: 'Open source',
                text: 'The code is open source under the AGPL-3.0 license: anyone can check how the app handles data or contribute.'
            },
            languages: {
                title: 'Languages',
                text: 'The app and the bot work in English, Ukrainian, and Polish. If you’d like to help translate into another language, let me know in your feedback.'
            },
            links: {
                title: 'Links',
                github: 'Code on GitHub',
                princess: 'Princess of the Day, another bot by the author',
                youtube: 'The author’s YouTube channel',
                telegram: 'The author’s Telegram channel',
                x: 'The author on X'
            },
            version: 'Version {version}'
        },
        settings: {
            title: 'Settings',
            groups: {
                profile: 'Profile',
                app: 'App'
            },
            visibility: 'Visibility',
            payments: 'Payment info',
            language: 'Language',
            languageAuto: 'Auto: {language}',
            paymentsSet: 'Added',
            paymentsEmpty: 'Not set',
            visibilityNone: 'Not set',
            currency: 'Currency',
            delivery: 'Delivery address',
            deliverySet: 'Added',
            deliveryEmpty: 'Not set',
            listImport: 'Import a wish list',
            theme: {
                title: 'Theme',
                system: 'Match Telegram',
                systemHint: 'Light or dark, the same as Telegram right now.',
                light: 'Light',
                dark: 'Dark'
            }
        }
    }
};

export default en;
