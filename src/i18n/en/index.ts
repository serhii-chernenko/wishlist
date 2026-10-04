import type { Translation } from '../i18n-types';

const en: Translation = {
    title: 'Wish list ❤️',
    errors: {
        unknown: '🤷 Oops, something went wrong...',
        outdatedButton: 'This button is outdated. Here is the main menu 👇'
    },
    language: {
        title: '🇺🇸 EN | 🇺🇦 UA | 🇵🇱 PL',
        description:
            '🇺🇸 Change a language of the bot interface.\n🇺🇦 Змінити мову для інтерфейсу боту.\n🇵🇱 Zmień język interfejsu bota.\n\n🎲 If you choose the auto mode, a language of bot interface will be the same as it set in Telegram preferences.\n🎲 Якщо обрати автоматичний режим, мова інтерфейсу боту буде така сама, як вказана в налаштуваннях Телеграму.\n🎲 Jeśli wybierzesz tryb automatyczny, język interfejsu bota będzie taki sam jak ustawiony w Telegramie.',
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
        success: '✅ The interface language is now: {0}',
        current: 'Current language: {0}',
        invalid: '❌ Unknown language: {0}\nAvailable options: en, uk, pl, auto'
    },
    actions: {
        home: '🏠 Home',
        back: '🔙 Back',
        open: '🔗 Open',
        edit: '✏️ Edit',
        remove: '❌ Remove',
        clean: '🧹 Clean',
        share: '💌 Share',
        yes: '✅ Yes',
        no: '❌ No',
        more: 'Show more',
        language: '🌐',
        openApp: '📱 Open the app'
    },
    greeting: {
        general: `Hey there!\nHow often do you run into the problem of not knowing what to give someone important to you,\nor not being able to remember what you would like yourself when people ask - "<i>what should I give you?</i>"?\nI don't know about you, but I have this all the time...\nThere is a way out! And not through the window :D\nShare this bot with your family, friends and acquaintances to make life easier for them and for yourself)`,
        guest: `In this bot you can:\n\n❤️ Open your own wish list.\n🎁 See your own <b>I want to give</b> list.\n🔎 Find another person's wish list.\n\n👤 <b>But for that you need to sign up.</b>\n\n🧐 Right now you can tap\n<b>Read more</b> to get more information about the bot and how your data is used.\n\n💬 Or if you run into any trouble, you can tell me about it by tapping <b>Leave feedback</b>`,
        user: 'What would you like to do?'
    },
    privacy: {
        title: '🧐 Read more',
        description: {
            sensitive:
                '<b>Private data</b>\n\nYour phone number is private information of every user!\nIt is used only to let other users find your wish list if they know your number.\nThis bot is open source, and you can check the code on GitHub via the link below.\nThe user database is stored in Cloudflare with solid protection!\nThe bot stores only your username and/or phone number.\nNo first names, no last names, unless you share your wish list yourself: then the bot keeps the name from your Telegram to show it on the public page. When you stop sharing, the name is deleted.\nIf you turn them on, your phone number and delivery address are shown only in Telegram and never on the web page.\nThanks for caring about this important topic ❤️',
            openSource:
                '\n\n<b>Open source</b>\n\nOpen source means that anyone can\n- help improve the project\n- see how the code is written\n- this project is also licensed under GNU AGPLv3, which means the code can be fully copied for any other project, even a commercial one.',
            languages:
                '\n\n<b>Languages</b>\n\nThe bot speaks English, Ukrainian and Polish.\nYou can change the language with the 🌐 button or the /lang command, and in Auto mode the bot follows the language of your Telegram.\nIf you would like to help with translations into other languages, leave your contact details in the feedback.',
            feedback: '\n\n<b>Leave feedback</b>',
            otherProjects: {
                title: '\n\n<b>Other projects</b>',
                projects: {
                    princess:
                        'A Telegram bot made purely for fun - Princess of the Day.\nIt picks a random member of a community to be the princess of the day and generates a nice greeting ☺️',
                    youtube:
                        'A YouTube channel where I teach programming and share my experience.',
                    telegram:
                        'A Telegram channel made alongside the YouTube one for insights and feedback from the audience.'
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
            title: '💬 Tell me everything you think about the bot)',
            points: '\n\n- how much you like the bot 😅\n- something is broken and needs fixing\n- ideas for improvement\n- you want to help translate the bot into other languages\n\nIf you need a reply, leave your contact details, for example your Telegram username, phone number or email, so I can write to you and help solve the problem.'
        },
        message: '#feedback from {0}\n\n{1}',
        fromApp: '#feedback from the app by {0}\n\n{1}',
        success: 'Thanks for reaching out ☺️\nI will read it as soon as I can!',
        errors: {
            tooLong:
                '❌ That feedback is too long! The maximum is {0} characters.\nPlease shorten it and send it again.'
        }
    },
    auth: {
        title: {
            guest: '👤 Sign up',
            user: '👤 Change visibility'
        },
        description: {
            general: 'How do you want other users to find you?',
            user: '<b>Right now you can be found:</b>\n{0}',
            guest: '\n\n<b>You can change this choice later!</b>',
            username:
                '\n\nAlso, if you choose:\n{username}\nor\n{both},\nthen when you change your username in Telegram settings, it will be updated in the bot database automatically the next time you use the bot.\nSo there is nothing to update after a username change.'
        },
        types: {
            username: '👤 By username only',
            phone: '📱 By phone number only',
            both: '👤 📱 By username and by phone number'
        },
        sendNumber: {
            title: '📱 Send number',
            description: `I need your number to add it to the search database.\nDon't worry, it will be used for search only.\n\nTap the button:\n📱 <b>Send number</b>\nNo need to type the number manually!`
        },
        errors: {
            username: `❌ You don't have a username yet.\nTry adding one in your Telegram settings and come back ;)`,
            phone: `❌ That doesn't look like a phone number, please try again.\nMake sure you tap the <b>Send number</b> button at the bottom near the keyboard instead of typing the number yourself.`,
            foreignContact:
                '❌ That is not your contact.\nTap the <b>Send number</b> button at the bottom near the keyboard to share your own number.'
        },
        success: {
            user: '✅ Your details are updated!',
            guest: '✅ Your details are now in the database!',
            username: '\n👤 People will be able to find you by username:\n@{0}',
            phone: '\n📱 People will be able to find you by phone number:\n{0}',
            both: '\nPeople will be able to find you\n👤 By username: @{0}\n📱 And by phone number: {1}',
            app: '✅ Got your number! Head back to the app, everything is already updated there.'
        }
    },
    wishlist: {
        title: '❤️ My wish list',
        empty: 'There are no wishes in your wish list yet!\nAdd your first wish to the list.',
        filtered:
            'No wishes found in your wish list with the filter turned on!\nTry turning the filters off.',
        filled: {
            before: '<b>Here is your wish list:</b>',
            after: '❓<b>What would you like to do?</b>\n\n➕ Add a new wish to the list.\n✏️ Edit an existing wish in the list.\n❌ Remove an existing wish from the list.\n🧹 Clean the wish list.\n💌 Share your wishes with others via a link.'
        },
        add: {
            title: '➕ New wish',
            description:
                'Send the title of the new wish in the next message.\nNo more than {0} characters!',
            error: `❌ That doesn't look like a good title!\nTry again.`,
            success: '✅ The new wish was added to your list!',
            limit: '❌ Your wish list is full: it can hold up to 500 wishes.\nRemove some wishes first.'
        },
        edit: {
            description: '✏️ Wish editing menu',
            actions: {
                title: '✏️ Change title',
                addDescription: '✏️ Add description',
                updateDescription: '✏️ Update description',
                addImages: '🌅 Add images',
                updateImages: '🌅 Update images',
                addLink: '🔗 Add link',
                updateLink: '🔗 Update link',
                setPriority: '❗️I really want this',
                unsetPriority: `❗I don't want it that much anymore`,
                priority: '🎯 Priority: {level}',
                imagesOrder: '🔀 Photo order',
                hide: '🫣 Hide from others',
                show: '👀 Make visible again',
                addPrice: '💸 Set price',
                updatePrice: '💸 Update price'
            },
            scenes: {
                title: '✏️ Send the new title of the wish.\nNo more than {0} characters!',
                addDescription:
                    '✏️ Add a description to the current wish\nNo more than {0} characters!',
                updateDescription:
                    '✏️ Change the description (no more than {0} characters) or ❌ remove it',
                addImages: '🌅 Add new images (no more than 9)',
                updateImages:
                    '🌅 Add new images (no more than 9), or ❌ remove all the added ones',
                addLink: '🔗 Add a link',
                updateLink: '🔗 Change the link or ❌ remove it',
                addPrice: '💸 Set the price',
                updatePrice: '💸 Update the price or ❌ remove it',
                priceCurrency: 'Just a number, in {0}.'
            },
            errors: {
                title: {
                    general: '❌ Invalid title!',
                    link: `❌ The title can't contain a link!`
                },
                description: '❌ Invalid description!',
                removeImages: '❌ There are no images!',
                updateImages: '❌ There are no images in the message!',
                link: '❌ The link must contain an http match!',
                price: '❌ Invalid price!'
            },
            success: {
                title: '✅ The title was updated!',
                removeDescription: '✅ The description was removed!',
                updateDescription: '✅ The description was updated!',
                removeImages: '✅ The images were removed!',
                updateImages: '✅ The images were added!',
                imagesLimit: `ℹ️ Only 9 images were saved: you can't add more to one wish.`,
                removeLink: '✅ The link was removed!',
                updateLink: '✅ The link was updated!',
                priority: '✅ The priority was updated!',
                visibility: '✅ The visibility was changed!',
                removePrice: '✅ The price was removed!',
                updatePrice: '✅ The price was updated!'
            },
            currency: {
                hint: 'Choose the currency of this wish. Right now: {currency}.',
                success: '✅ The wish currency was changed: {currency}'
            },
            images: {
                order: {
                    prompt: '🔀 Pick the photo that should come first. The first photo is the cover of the wish.',
                    caption: 'Photo {n}',
                    makeFirst: '⬆️ Make photo {n} first',
                    success: '✅ The photo order was changed!',
                    changed:
                        'ℹ️ The photos changed in the meantime, so the order was not saved. Try again.'
                }
            }
        },
        remove: {
            confirm:
                '❓Was your wish fulfilled (for statistics only, the wish will be removed either way)?',
            success: '✅ The wish was removed!'
        },
        clean: {
            error: '❌ The wish list is already empty!',
            success: '✅ The wish list was cleaned!',
            confirm: `❓<b>Really clean the wish list?</b>\n\nAll wishes will be removed, and they will also disappear from other people's <b>I want to give</b> lists. This can't be undone.`
        },
        share: {
            success: '✅ Here is the link to your wish list:\n{url}',
            empty: '❌ Nothing to share yet: your wish list is empty.\nAdd at least one wish first.',
            consent:
                '🌐 Before you share\n\nThe bot will create a public page of your wish list on {host}. It will show:\n• the name from your Telegram profile: {name}\n• your @username, only if you turn it on yourself\n• all your wishes except hidden ones, with their photos\n• your payment details, if you have added them\n\nAnyone with the link can open the page, and it may appear in search engine results. Your phone number and your "I want to give" list are never shown there. If you turn them on, your phone number and delivery address are shown only in Telegram, never on the web page.\n\nYou can stop sharing at any time.',
            ready: '✅ Your wish list is ready!\n\n📲 Open in Telegram:\n{appUrl}\n\n🌐 Page in the browser:\n{pageUrl}\n\nThe page updates itself after every change to your list.',
            stopConfirm:
                '❓ Stop sharing your wish list?\n\nThe page will stop opening and the saved name will be deleted. If you share again later, the same link will work again, so everyone who has it will see your list again.',
            stopped:
                '✅ Done, you are no longer sharing your wish list.\nThe page at the link no longer opens.',
            newConfirm:
                '❓ Create a new link?\n\nThe old link will stop working right away, and nobody will be able to open your list with it anymore. You will need to send the new link to your friends again.',
            rotated:
                '✅ Here are the new links to your wish list.\n\n📲 Open in Telegram:\n{appUrl}\n\n🌐 Page in the browser:\n{pageUrl}\n\nThe old links no longer work.',
            pageEmpty:
                'ℹ️ The page is empty right now: there are no visible wishes on it. The link works, and wishes will appear on the page as soon as you add them.',
            sendText:
                'My wish list ❤️ Pick a gift for me 🎁\n\n🌐 No Telegram? Open it in a browser:\n{pageUrl}',
            actions: {
                publish: '✅ Share',
                openTelegram: '📲 Open in Telegram',
                openBrowser: '🌐 Page in the browser',
                send: '📤 Send to friends',
                stop: '🚫 Stop sharing',
                newLink: '🔄 New link',
                showUsername: '👤 Show my @username',
                hideUsername: '🙈 Hide my @username',
                showGifted: '🎁 Show gifted wishes',
                hideGifted: '🙈 Hide gifted wishes'
            },
            gifted: {
                shown: '🎁 Friends will now see what you’ve already been given at the end of your list.',
                hidden: '🙈 Friends no longer see your gifted wishes.'
            }
        }
    },
    giveList: {
        title: '🎁 I want to give',
        empty: `Your <b>I want to give</b> list is empty for now. Wishes you reserve will appear here.\n🔎 Find another person's wish list to reserve a wish.`,
        filled: {
            before: '<b>Here are the wishes you have reserved for others:</b>',
            after: '❓<b>What would you like to do?</b>\n\n❌ Cancel the reservation of a wish.\n🧹 Clean the <b>I want to give</b> list'
        },
        givers: '\n\n👥 <i>Also reserved by: {0}</i>',
        owner: '\n\n👤 For user: <b>{0}</b>',
        success: {
            remove: '✅ Reservation cancelled, the wish was removed from your <b>I want to give</b> list!',
            clean: '✅ All reservations cancelled, your <b>I want to give</b> list is clean!'
        },
        clean: {
            confirm:
                '❓<b>Really clean the I want to give list?</b>\n\nAll your reservations will be cancelled and the wishes will disappear from this list.'
        }
    },
    findList: {
        title: '🔎 Find another wish list',
        description:
            'Try to find a person by username or phone number.\n\nReasons why a person might not be found:\n1. The person has not used the bot.\n2. If you search by phone number and you are sure the number is correct...\nThe person you are looking for may not have wanted to share their number with the bot.\nTry searching by username.\n\n<b>Send the username or phone number of the person in the next message.</b>',
        empty: 'This person has not filled in their wish list yet',
        filtered:
            'No wishes found in this wish list with the filter turned on!\nTry turning the filters off.',
        filled: {
            before: 'Here is the wish list of <b>{0}</b>:',
            payments: `If you can't give a specific gift, the user has shared payment details you can send money to, so they can buy the gift themselves:\n\n{0}`,
            after: `❓<b>What would you like to do?</b>\n\n🎁 Reserve a wish\n❌ Cancel the reservation of a wish`,
            contact: {
                title: '📇 <b>Contact and delivery</b>',
                phone: '📱 Phone: {phone}',
                address: '📦 Delivery address:\n{address}'
            }
        },
        givers: {
            you: '\n\n👥 <i>Reserved by you</i>',
            somebodyAndYou: '\n\n👥 <i>Reserved by you and {0} more</i>',
            somebody: '\n\n👥 <i>Reserved by others: {0}</i>'
        },
        actions: {
            give: '🎁 Reserve',
            take: '❌ Cancel reservation'
        },
        errors: {
            give: '❌ Already reserved by you!',
            take: '❌ You have not reserved this wish!',
            notFound: '❌ Person not found, please try again!',
            foundYourself: `❌ Nice try, sneaky, but you can't search for yourself! 😘`,
            tooLong:
                '❌ That search is too long! The maximum is {0} characters, please try again.'
        },
        success: {
            give: '✅ Reserved! The wish was added to your <b>I want to give</b> list.',
            take: '✅ Reservation cancelled, the wish was removed from your <b>I want to give</b> list.'
        }
    },
    donate: {
        title: '💸 Support the author with a donation 🥹👉👈',
        description:
            'The bot will stay free for as long as possible, so that we Ukrainians can give each other gifts.\nThis is very important, this is really needed. Because we are all we have!\n\nBut if you want to support the author, you can do it with the services listed below, or directly via PayPal:\n{paypal}\n\nAnd I will be sincerely grateful ❤️\n\nMost of all donations go to fundraisers for the Armed Forces of Ukraine.\nThe fundraisers and reports can be found in my Telegram channel via the link below.',
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
        wishes: '🎁 Wishes created all time: <b>{0}</b>',
        done: '✅ Wishes fulfilled all time: <b>{0}</b>'
    },
    contacts: {
        telegram: '🔗 Telegram channel'
    },
    share: {
        title: 'Wish list of {name}'
    },
    markup: {
        title: '❤️ <b>{0}</b>',
        description: '\n\n✏️ Description:\n{0}',
        priority: {
            low: {
                owner: '\n\n<blockquote>🟢 <b>I kind of want this right now</b></blockquote>',
                watcher:
                    '\n\n<blockquote>🟢 <b>They kind of want this right now</b></blockquote>'
            },
            medium: {
                owner: '\n\n<blockquote>🟡 <b>I want this right now</b></blockquote>',
                watcher:
                    '\n\n<blockquote>🟡 <b>They want this right now</b></blockquote>'
            },
            high: {
                owner: '\n\n<blockquote>❗️ <b>I really want this right now!</b></blockquote>',
                watcher:
                    '\n\n<blockquote>❗️ <b>They really want this right now!</b></blockquote>'
            }
        },
        hidden: '\n\n🫣 <i>This wish is hidden from others!</i>',
        price: '\n\n💸 Estimated price: <b>{0}</b>',
        approx: '≈ {0} ({1})',
        date: {
            created: '\n\n🗓 <i>Created: {0}</i>',
            updated: '\n🗓 <i>Updated: {0}</i>'
        }
    },
    payments: {
        title: {
            add: '💸 Add payment details',
            update: '💸 Update payment details'
        },
        description: {
            add: `Here you can add your own payment details, in case other people who want to give you something from your wish list can't do it and would like to send you money to buy the gifts yourself.\n\nAdd only the details you want other users to see. For example:\n- A Monobank jar\n- A bank card number\n- A PayPal contact\n- A link to Buymeacoffee or similar services.{current}\n\n<b>Send the new payment details in the next message</b>.`,
            update: '<b>Your current payment details:</b>\n{0}'
        },
        edit: {
            error: `❌ That doesn't look like valid information!\nTry again.`,
            success: '✅ The payment details were updated!',
            tooLong:
                '❌ The payment details are too long! The maximum is {0} characters.\nTry again.'
        },
        remove: {
            success:
                '✅ The payment details were removed! You can always come back here to add them again!'
        }
    },
    settings: {
        title: '⚙️ Settings',
        description:
            'Choose what to set up: language, currency, payment info, delivery address, or what others see.'
    },
    currency: {
        title: '💱 Currency',
        description:
            'Choose the currency you use for the price of new wishes. Each wish keeps its own currency, and others see amounts approximately, converted at the National Bank of Ukraine rate.\n\nCurrent currency: <b>{current}</b>',
        options: {
            UAH: '🇺🇦 ₴ Hryvnia',
            USD: '🇺🇸 $ US dollar',
            EUR: '🇪🇺 € Euro',
            PLN: '🇵🇱 zł Złoty'
        },
        success: '✅ Currency changed: {currency}'
    },
    priority: {
        title: '🎯 Priority',
        levels: {
            none: '⚪ No priority',
            low: '🟢 Low',
            medium: '🟡 Medium',
            high: '🔴 High'
        },
        success: '✅ Priority changed: {level}'
    },
    delivery: {
        title: {
            add: '📦 Add delivery address',
            update: '📦 Update delivery address'
        },
        description:
            'Say where gifts should be sent, for example a Nova Poshta branch or a parcel locker. 5 to 300 characters, up to 6 lines, no links.{current}\n\n<b>Send the new address in the next message</b>.',
        phoneWarning:
            'ℹ️ The address is shown to others only together with your phone number. You can turn this on in “What others see”.',
        errors: {
            tooShort: '❌ Not enough details: add a little more.\nTry again.',
            tooLong:
                '❌ The address is too long! The maximum is {max} characters.\nTry again.',
            containsLink: '❌ Links are not allowed in the address.\nTry again.'
        },
        success: {
            update: '✅ The delivery address was saved!',
            remove: '✅ The delivery address was removed! You can always come back here to add it again!'
        }
    },
    disclosure: {
        title: '👀 What others see',
        description:
            'Choose what others see when they open your wish list. Your phone number and delivery address are shown only in Telegram, never on the web page. They are off by default.',
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
            phone: '❓ Show your phone number?\n\nAnyone who opens your wish list in Telegram will see it: through your link, or by searching for your username or number. It is never shown on the web page. Messages that were already sent stay in the chat of whoever received them.',
            address:
                '❓ Show your delivery address?\n\nAnyone who opens your wish list in Telegram will see it: through your link, or by searching for your username or number. It is shown only together with your phone number, and never on the web page. Messages that were already sent stay in the chat of whoever received them.'
        },
        needsPhone:
            '❌ Turn on showing your phone number first: the address is shown only together with it.',
        needsAddress: '❌ Add a delivery address first.',
        phoneMissing:
            '❌ The bot does not have your phone number. First allow others to find you by phone number in “Change visibility”.',
        saved: '✅ Settings saved!',
        indexing: {
            title: 'Show in search engines',
            hint: 'When this is on, Google and other search engines may show your wish list page, including the payment info on it. Turning it off adds noindex to the page, but copies that are already indexed can take some time to disappear.',
            on: '✅ Search engines: allowed',
            off: '🚫 Search engines: blocked'
        }
    },
    filters: {
        title: '💰 Filter by price',
        description: 'Show only the wishes that match the given price.',
        applied: '\n\nPrice filter applied:\n<b>{0}</b>',
        fromTo: 'From {0} to {1}',
        from: 'From {0}',
        to: 'Up to {0}',
        reset: '❌ Reset filters',
        success: {
            reset: '✅ The filters were reset!',
            set: '✅ The filter was set!'
        }
    },
    pagination: {
        range: 'Showing {0}-{1} of {2}'
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
            title: 'The bot has been updated to version {version} 🎉',
            footer: 'All changes and previous versions: /releases'
        },
        empty: 'There are no release notes yet.'
    },
    web: {
        header: {
            count: '{count} {{count:wish|wishes}}',
            summary: '{count} {{count:wish|wishes}}, updated {date}',
            username: 'Telegram: @{username}',
            lead: 'Wish list of',
            fallback: 'Wish list'
        },
        payments: {
            title: 'You can also give money'
        },
        wish: {
            priority: {
                low: 'Kind of wants this',
                medium: 'Wants this',
                high: 'Really wants this'
            },
            price: 'Approximate price:',
            approx: '≈ {amount}',
            original: '(original price {amount})',
            link: 'Open on {host}',
            photo: 'Photo {index} of {total}',
            details: 'More details',
            created: 'Added {date}',
            updated: 'Added {created}, updated {updated}',
            gifted: 'Gifted'
        },
        empty: 'Nothing here yet. Wishes will appear as soon as they are added to the list.',
        truncated: 'Showing the first {limit} wishes of the list.',
        ratesNote:
            'Prices in other currencies are approximate, converted to {currency} at the National Bank of Ukraine rate for {date}',
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
            system: 'Match the system',
            light: 'Light theme',
            dark: 'Dark theme'
        },
        notFound: {
            title: 'Page not found',
            description:
                "This wish list doesn't exist or the link is out of date.",
            cta: 'Open the bot'
        },
        gone: {
            title: 'This wish list is no longer shared',
            description:
                'The owner no longer shares this list. If they share it again, the link will work.'
        },
        meta: {
            description:
                '{name}: {count} {{count:wish|wishes}} on the wish list'
        },
        home: {
            title: 'Wish list: a Telegram bot for wishes and gift ideas',
            description:
                'Collect your wishes in a Telegram bot, share one link, and the people close to you will give you exactly what you want. Free, in English, Ukrainian and Polish.',
            name: 'Wish list',
            tagline:
                'Keep your wishes in Telegram, share a link, and let the people close to you pick a gift you actually want.',
            cta: 'Open {bot}',
            note: 'Free. All you need is Telegram.',
            steps: {
                title: 'How it works',
                create: {
                    title: 'Create your list in the bot',
                    text: 'Add wishes with a title, a description, up to 9 photos, a price and a link to the shop.'
                },
                share: {
                    title: 'Share a link',
                    text: 'The bot makes a public page of your list. Send the link to friends, or let them find you in the bot by username or phone number.'
                },
                give: {
                    title: 'Friends reserve a wish',
                    text: 'They tap “Reserve” and the wish lands in their “I want to give” list. Other friends see that it is already reserved, you do not, so the surprise stays a surprise.'
                }
            },
            features: {
                title: 'What the bot can do',
                photos: {
                    title: 'Photos and links',
                    text: 'Up to 9 photos per wish and a link to the shop, so nobody gets the wrong model or colour.'
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
                    text: 'All your wishes on one page that opens without Telegram. It updates itself.'
                },
                search: {
                    title: 'Find friends',
                    text: 'Find other lists by username or phone number, if their owners allow it.'
                },
                languages: {
                    title: 'Three languages',
                    text: 'English, Ukrainian and Polish, or automatic, following your Telegram language.'
                }
            },
            privacy: {
                title: 'Privacy',
                phone: 'Your phone number is never public: it is only used for search.',
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
        releases: 'What is new in the bot',
        app: 'Open the app'
    },
    appEntry: {
        text: '📱 The Wish list app opens right inside Telegram. It does everything the chat does: add wishes with photos, find friends’ lists and reserve wishes.'
    },
    app: {
        common: {
            appName: 'Wish list',
            loading: 'Loading…',
            retry: 'Try again',
            cancel: 'Cancel',
            save: 'Save',
            saving: 'Saving…',
            send: 'Send',
            sending: 'Sending…',
            remove: 'Remove',
            close: 'Close',
            back: 'Back',
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
            photoPlaceholder: 'No photo',
            menu: 'Menu',
            closeToast: 'Close the message',
            mainNavigation: 'Main navigation',
            externalLink: 'Opens in the browser'
        },
        toasts: {
            saved: 'Saved',
            removed: 'Removed',
            copied: 'Copied',
            undoUnavailable: 'This action cannot be undone'
        },
        errors: {
            generic: 'Something went wrong. Try again.',
            network:
                'Could not connect. Check your internet connection and try again.',
            unauthorized: 'Your session has expired. Open the app again.',
            forbidden: 'This action is not allowed.',
            previewAccessDenied:
                'This test version is available to the author only.',
            registrationRequired:
                'Choose how others can find you first, then try again.',
            tokenInvalid:
                'You no longer have access to this list. Find the person again.',
            tokenExpired:
                'Access to this list has expired. Find the person again.',
            notFound: 'This wish no longer exists.',
            listUnavailable: 'This wish list is not available right now.',
            shareGone: 'This wish list is no longer shared.',
            conflict: 'The data has changed. Refresh the screen and try again.',
            shareEmpty:
                'Nothing to share yet: add at least one wish that others can see.',
            notShared: 'You are not sharing your wish list right now.',
            imagesFull: 'A wish can have up to 9 photos.',
            wishLimit:
                'Your wish list is full: it can hold up to 500 wishes. Remove some first.',
            imageChanged:
                'The photos have changed. Refresh the screen and try again.',
            ownWish: 'You cannot reserve your own wish.',
            writeAccessRequired:
                'Allow the bot to message you so it can save photos.',
            payloadTooLarge: 'The file is too large. Pick a smaller one.',
            unsupportedMedia:
                'This format is not supported. Pick a JPEG, PNG or WebP photo.',
            validation: 'Fix the highlighted fields.',
            rateLimited:
                'Too many actions in a row. Try again in {seconds} {{seconds:second|seconds}}.',
            upstream: 'Telegram is not responding right now. Try again later.',
            notDelivered: 'Could not send your feedback. Try again later.',
            disabled: 'The app is temporarily unavailable.',
            internal: 'Something broke on our side. Try again.',
            notImplemented: 'This feature is not ready yet.'
        },
        fieldErrors: {
            required: 'This field is required.',
            empty: 'This field cannot be empty.',
            tooLong: 'Too many characters: {max} at most.',
            tooShort: 'Not enough details yet: add a little more.',
            containsLink:
                'The title cannot contain a link. Put it in the Link field.',
            invalid: 'This value is not valid.',
            usernameRequired:
                'You have no Telegram username. Add one in Telegram settings and come back.',
            usernameUnavailable:
                'Your username can be shown only when people can find you by it.',
            phoneRequired:
                'A phone number is needed: allow others to find you by it in Visibility.',
            addressRequired: 'A delivery address is needed. Add it first.'
        },
        outside: {
            title: 'Open in Telegram',
            text: 'This app works inside Telegram. Open it from the bot to see your wish list.',
            cta: 'Open in Telegram'
        },
        expired: {
            title: 'Session expired',
            text: 'The app has been open for too long. Close it and open it again.',
            cta: 'Close the app'
        },
        unavailable: {
            title: 'The app is temporarily unavailable',
            text: 'We are already on it. Meanwhile, you can do everything in the chat with the bot.',
            cta: 'Open the bot'
        },
        previewOnly: {
            title: 'Test version',
            text: 'This version of the app is open to the author only. Please use the main bot.',
            cta: 'Open the bot'
        },
        unsupported: {
            title: 'Telegram needs an update',
            text: 'Your Telegram version does not support this app. Update Telegram or use the bot in the chat.',
            cta: 'Open the bot'
        },
        bootError: {
            title: 'The app could not start',
            text: 'Try opening it again. If that does not help, the bot in the chat works as usual.',
            cta: 'Try again'
        },
        offline: {
            text: 'No connection. Showing the last loaded data.',
            cta: 'Try again'
        },
        nav: {
            home: 'Home',
            wishes: 'My wishes',
            gives: 'I want to give',
            find: 'Find a list',
            share: 'Share',
            settings: 'Settings',
            visibility: 'Visibility',
            payments: 'Payment details',
            language: 'Language',
            feedback: 'Feedback',
            stats: 'Statistics',
            donate: 'Support the author',
            releases: 'What’s new',
            about: 'About',
            currency: 'Currency',
            delivery: 'Delivery address'
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
            lead: 'Choose the currency you use for the price of new wishes. Each wish keeps its own currency, and others see amounts approximately, at the National Bank of Ukraine rate.',
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
            lead: 'Where gifts should be sent, for example a Nova Poshta branch or a parcel locker. Others see the address only in Telegram, and only if you turn it on.',
            label: 'Delivery address',
            placeholder: 'For example, Nova Poshta branch 12, Kyiv',
            hint: '5–300 characters, up to 6 lines, no links.',
            phoneWarning:
                'The address is shown only together with your phone number. You can turn this on in “Share your list”.',
            save: 'Save',
            remove: 'Remove the address',
            saved: 'Delivery address saved',
            removed: 'Delivery address removed'
        },
        home: {
            title: 'Wish list',
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
                    title: 'I want to give',
                    text: 'Wishes you have reserved for others'
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
                title: 'Welcome to Wish list',
                lead: 'Write down your wishes, share a link, and the people close to you pick the gift you really need.',
                stepsTitle: 'How it works',
                steps: {
                    create: {
                        title: 'Make your list',
                        text: 'Add wishes with a title, a description, up to 9 photos, a price and a shop link.'
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
                note: 'To create your list, choose how others can find you. It takes a minute.'
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
                cta: 'Reset the filter'
            },
            hiddenBadge: 'Only you see this',
            priorityToggle: 'High priority',
            hiddenToggle: 'Hide from others',
            photoCount: 'Photos: {count}',
            edit: 'Edit',
            menu: {
                share: 'Share the list',
                clean: 'Clear the list'
            },
            clean: {
                title: 'Clear your wish list?',
                text: 'All wishes will be removed and will disappear from other people’s “I want to give” lists. This cannot be undone.',
                confirm: 'Clear',
                success: 'Your wish list is cleared',
                empty: 'Your wish list is already empty'
            },
            toasts: {
                priorityOn: 'High priority set',
                priorityOff: 'Priority removed',
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
                'Neither you nor your friends will see it. It still counts in your stats.',
            restored: 'The wish is back on your list',
            hidden: 'Hidden',
            undo: 'Undo'
        },
        money: {
            approx: '≈ {amount}',
            original: '(original price {amount})'
        },
        filters: {
            title: 'Filter by price',
            all: 'All',
            upTo: 'Up to {amount}',
            from: 'From {amount}',
            range: 'From {from} to {to}',
            reset: 'Reset the filter',
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
                hint: 'In short, what exactly you want.',
                placeholder: 'For example, the board game Carcassonne'
            },
            description: {
                label: 'Description',
                hint: 'Size, colour, model: anything that helps get it right.',
                placeholder: 'Details worth knowing'
            },
            price: {
                label: 'Estimated price',
                hint: 'Just a number, in {currency}.',
                placeholder: '1500'
            },
            link: {
                label: 'Link',
                hint: 'A shop link that starts with https://',
                placeholder: 'https://',
                host: 'Opens on {host}'
            },
            priority: {
                label: 'Priority',
                hint: 'The higher the priority, the higher the wish sits in the list. Only high-priority wishes get a heart.',
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
                    'The title cannot contain a link. Put it in the Link field.',
                descriptionTooLong:
                    'The description is too long: {max} characters at most.',
                priceInvalid: 'Enter the price as a number, for example 1500.',
                linkInvalid: 'The link must start with http:// or https://.'
            },
            create: 'Add the wish',
            save: 'Save',
            created: 'Wish added',
            saved: 'Changes saved',
            createdAt: 'Added {date}',
            updatedAt: 'Updated {date}',
            remove: {
                action: 'Remove the wish',
                title: 'Did your wish come true?',
                text: 'This is just for statistics: the wish will be removed either way.',
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
            hint: 'Up to {max} photos. The first one becomes the cover.',
            count: '{count} of {max}',
            add: 'Add photos',
            remove: 'Remove the photo',
            removeAll: 'Remove all photos',
            removeAllConfirm: {
                title: 'Remove all photos?',
                text: 'All photos of this wish will be removed.',
                confirm: 'Remove all'
            },
            uploading: 'Uploading photos…',
            progress: '{done} of {total} uploaded',
            uploaded: 'Photo added',
            duplicate: 'This photo is already there',
            failed: 'Could not upload the photo',
            full: 'You cannot add more than {max} photos',
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
                conflict:
                    'The photos have changed. Refresh the screen and try again.'
            },
            chatFallback: {
                action: 'Add photos in the chat',
                hint: 'If photos don’t upload here, send them to the bot in the chat.',
                sent: 'The bot is waiting for photos in the chat'
            },
            writeAccess: {
                title: 'Permission needed',
                text: 'To save photos, the bot sends them to you in the chat. Allow the bot to message you.',
                allow: 'Allow'
            }
        },
        gives: {
            title: 'I want to give',
            count: '{count} {{count:gift|gifts}}',
            empty: {
                title: 'The list is empty',
                text: 'Wishes you reserve will appear here. Find a friend’s wish list and pick something to give.',
                cta: 'Find a list'
            },
            owner: 'For {owner}',
            others: 'Also reserved by: {count}',
            open: 'Open',
            remove: 'Cancel reservation',
            removed: 'Reservation cancelled',
            clean: {
                action: 'Clear the list',
                title: 'Clear your “I want to give” list?',
                text: 'All your reservations will be cancelled and the wishes will disappear from this list.',
                confirm: 'Clear',
                success: 'The list is cleared'
            }
        },
        find: {
            title: 'Find a wish list',
            label: 'Username or phone number',
            placeholder: '@username or +380…',
            hint: 'You can find someone who uses the bot and allows others to find them.',
            submit: 'Find',
            searching: 'Searching…',
            errors: {
                empty: 'Enter a username or a phone number.',
                notFound:
                    'Nobody found. Check the username or the phone number.',
                self: 'That’s your own list 😉 It’s in My wishes.',
                tooLong: 'The query is too long: {max} characters at most.'
            },
            reasons: {
                title: 'Why someone may not show up',
                notUser: 'The person has not used the bot yet.',
                phoneHidden:
                    'The person has not shared a phone number with the bot. Try their username instead.'
            }
        },
        third: {
            title: 'Wish list',
            lead: 'Wish list of {label}',
            count: '{count} {{count:wish|wishes}}',
            empty: 'This person has not filled in a wish list yet.',
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
            taken: 'Reservation cancelled',
            viewOnly:
                'You can only view this list. To reserve a wish, find the person by username or phone number.',
            searchAgain: 'Find again',
            payments: {
                title: 'You can give money',
                text: 'If you can’t buy a specific gift, you can send money to these details so the person can buy it themselves.'
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
                lead: 'The bot will create a public page of your wish list on {host}. It will show:',
                name: 'the name from your Telegram: {name}',
                username: 'your @username, only if you turn it on yourself',
                wishes: 'all wishes except hidden ones, with their photos',
                payments:
                    'your payment details, if you added them (your phone number and delivery address are never shown there, even if you turn them on)',
                public: 'Anyone with the link can open the page, and it may appear in search engine results.',
                private:
                    'Your phone number and your “I want to give” list are never shown there.',
                stop: 'You can stop sharing at any time.'
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
                    phone: 'Your phone number will be visible to anyone who opens your list in Telegram: through your link, or by searching for your username or number. It is never shown on the web page. Messages that were already sent stay in the viewer’s chat.',
                    address:
                        'Your delivery address will be visible to anyone who opens your list in Telegram: through your link, or by searching for your username or number. It is shown only together with your phone number, and never on the web page. Messages that were already sent stay in the viewer’s chat.'
                },
                phoneMissing:
                    'First allow others to find you by phone number in Visibility.',
                addressMissing: 'Add a delivery address first.',
                needsPhone:
                    'The address can be shown only together with your phone number.'
            },
            indexing: {
                title: 'Show in search engines',
                hint: 'When this is on, Google and other search engines may show your wish list page, including the payment info on it. Turning it off adds noindex to the page, but copies that are already indexed can take some time to disappear.'
            },
            publish: 'Share',
            published: 'You are now sharing your wish list',
            link: {
                title: 'Your link',
                copy: 'Copy',
                copied: 'Link copied',
                send: 'Send to friends',
                open: 'Open the page',
                appTitle: 'Link for Telegram',
                openApp: 'Open in Telegram',
                appHint:
                    'Opens your list right in Telegram, where friends can reserve a wish straight away.',
                webTitle: 'Page in the browser',
                webHint: 'For people who don’t use Telegram.'
            },
            sendText: 'My wish list ❤️ Pick a gift for me 🎁',
            sendBrowserHint: '🌐 No Telegram? Open it in a browser:',
            autoUpdate:
                'The page updates itself after every change to your list.',
            pageEmpty:
                'The page is empty right now: it has no visible wishes. They will appear as soon as you add them.',
            username: {
                label: 'Show my @username',
                hint: 'Friends will be able to message you on Telegram.',
                shown: 'Your @username is now on the page',
                hidden: 'Your @username is no longer on the page'
            },
            gifted: {
                label: 'Show gifted wishes',
                hint: 'Friends will see what you’ve already been given at the end of your list',
                shown: 'Friends can now see your gifted wishes',
                hidden: 'Friends no longer see your gifted wishes'
            },
            rotate: {
                action: 'New link',
                title: 'Create a new link?',
                text: 'The old link stops working right away. You will need to send the new one to your friends again.',
                confirm: 'Create',
                success: 'Your new link is ready, the old one no longer works'
            },
            stop: {
                action: 'Stop sharing',
                title: 'Stop sharing?',
                text: 'The page will stop opening and the saved name will be deleted. If you share again, the same link will work.',
                confirm: 'Stop',
                success: 'You are no longer sharing your wish list'
            }
        },
        payments: {
            title: 'Payment details',
            lead: 'If someone wants to give you something from your list but can’t buy it, they can send money to these details instead.',
            label: 'Payment details',
            hint: 'A jar, a card number, PayPal or a link to a tipping service. Add only what you are happy for others to see.',
            placeholder: 'For example, a link to your jar',
            preview: 'This is how others will see them',
            empty: 'No payment details yet.',
            save: 'Save',
            saved: 'Payment details saved',
            errors: {
                tooShort: 'Not enough details yet: add a little more.',
                tooLong: 'Too many characters: {max} at most.'
            },
            remove: {
                action: 'Remove payment details',
                title: 'Remove your payment details?',
                text: 'Others will no longer see them on your list.',
                confirm: 'Remove',
                success: 'Payment details removed'
            }
        },
        visibility: {
            title: 'Visibility',
            guestTitle: 'Sign up',
            lead: 'How would you like others to find you?',
            later: 'You can change this at any time.',
            current: 'Right now people can find you',
            currentNone: 'Right now nobody can find you.',
            options: {
                username: {
                    title: 'By username only',
                    hint: 'If you change your username in Telegram, it updates here by itself.'
                },
                phone: {
                    title: 'By phone number only',
                    hint: 'Nobody sees your number: it is used only for search.'
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
                'You have no Telegram username. Add one in Telegram settings so people can find you by it.',
            yourUsername: 'Your username: @{username}',
            yourPhone: 'Your number: {phone}',
            save: 'Save',
            shareNumber: 'Share my number',
            phoneHint:
                'Telegram will ask you to confirm that you share your number with the bot. No need to type it.',
            waiting: 'Waiting for your number…',
            cancelled: 'The number was not sent',
            timeout: 'Your number did not arrive. Try again.',
            success: {
                guest: 'Done! People can find you now',
                user: 'Visibility updated'
            }
        },
        language: {
            title: 'Language',
            lead: 'Choose the app language. The bot in the chat will use it too.',
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
            lead: 'Say whatever you think: what you like, what broke, what to improve, or offer help with translations.',
            contactHint:
                'If you’d like a reply, leave a contact: a username, a phone number or an email.',
            label: 'Message',
            placeholder: 'Your feedback',
            send: 'Send',
            errors: {
                empty: 'Write at least a few words.',
                tooLong: 'The feedback is too long: {max} characters at most.'
            },
            success: {
                title: 'Thank you for the feedback!',
                text: 'I will read it as soon as I can.',
                another: 'Write more'
            }
        },
        stats: {
            title: 'Statistics',
            users: 'Active users',
            wishes: 'Wishes created all time',
            done: 'Wishes fulfilled all time'
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
            lead: 'Wish list helps you collect wishes and pick the gifts people really need.',
            privacy: {
                title: 'Privacy',
                storage:
                    'Your data is stored on Cloudflare with strong protection. The bot keeps only your username and, if you allow it, your phone number.',
                phone: 'Your phone number is never shown to anyone: it is used only to find your list.',
                name: 'Your Telegram name appears on the public page only after you agree, and disappears as soon as you stop sharing.',
                photos: 'Wish photos are visible only to the people you show your list to.'
            },
            openSource: {
                title: 'Open source',
                text: 'The code is open under the AGPL-3.0 licence: anyone can check how the app handles data or join the development.'
            },
            languages: {
                title: 'Languages',
                text: 'The app and the bot work in English, Ukrainian and Polish. If you’d like to help translate into another language, say so in your feedback.'
            },
            links: {
                title: 'Links',
                github: 'Code on GitHub',
                princess: 'Princess of the day, another bot by the author',
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
            payments: 'Payment details',
            language: 'Language',
            languageAuto: 'Auto: {language}',
            paymentsSet: 'Added',
            paymentsEmpty: 'Not set',
            visibilityNone: 'Not set',
            currency: 'Currency',
            delivery: 'Delivery address',
            deliverySet: 'Added',
            deliveryEmpty: 'Not set',
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
