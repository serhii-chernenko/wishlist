const {
    Scenes: { WizardScene },
    Markup,
    Composer
} = require('telegraf');
const User = require('../models/user');
const Wish = require('../models/wish');
const Give = require('../models/give');
const { setTimer } = require('../helpers/timer');
const getWishMarkup = require('../helpers/wish-markup');
const getMediaGroup = require('../helpers/media-group');
const getComplexStepHandler = require('../helpers/complex-step-handler');
const { onUnknownError } = require('../helpers/on-unknown-error');
const { GREETING, FIND_LIST, THIRD_WISHLIST, WISHLIST } = require('./types');
const {
    getPriceFilter,
    getPriceFilterTitle,
    getStepFilterHandler
} = require('../helpers/filters');
const { GIVE, TAKE, FILTER, FILTER_RESET } = {
    GIVE: 'give_',
    TAKE: 'take_',
    FILTER: 'filter',
    FILTER_RESET: 'filter_reset'
};

const stepHandler = getComplexStepHandler([GREETING, FIND_LIST]);
const filtersHandler = new Composer();

const getExistingWishInGiveList = async (ctx, wishId) => {
    if (!wishId) {
        try {
            await ctx.sendMessage(
                ctx.session.messages.errors.unknown,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, THIRD_WISHLIST);
        } catch (e) {
            return await onUnknownError(ctx, e);
        }
    }

    try {
        const wish = await Wish.findById(wishId);

        if (!wish) {
            await ctx.sendMessage(
                ctx.session.messages.errors.unknown,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, THIRD_WISHLIST);
        }

        const existingInWishList = await Give.findOne({
            userId: ctx.session.user._id,
            wishId
        });

        return {
            wish,
            existingInWishList
        };
    } catch (e) {
        return await onUnknownError(ctx, e);
    }
};

stepHandler.action(new RegExp(GIVE), async ctx => {
    const wishId = ctx.update.callback_query.data.replace(GIVE, '');

    try {
        const { existingInWishList, wish } = await getExistingWishInGiveList(
            ctx,
            wishId
        );

        if (existingInWishList) {
            await ctx.replyWithMarkdown(
                ctx.session.messages.findList.errors.give +
                    ctx.session.messages.findList.back,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, THIRD_WISHLIST);
        }

        const give = await new Give({
            userId: ctx.session.user._id,
            wishId: wish._id
        });

        await give.save();

        await ctx.replyWithMarkdown(
            ctx.session.messages.findList.success.give +
                ctx.session.messages.findList.back,
            Markup.removeKeyboard()
        );

        return await setTimer(ctx, THIRD_WISHLIST);
    } catch (e) {
        return await onUnknownError(ctx, e);
    }
});

stepHandler.action(new RegExp(TAKE), async ctx => {
    const wishId = ctx.update.callback_query.data.replace(TAKE, '');

    try {
        const { existingInWishList, wish } = await getExistingWishInGiveList(
            ctx,
            wishId
        );

        if (!existingInWishList) {
            await ctx.replyWithMarkdown(
                ctx.session.messages.findList.errors.take +
                    ctx.session.messages.findList.back,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, THIRD_WISHLIST);
        }

        await Give.deleteOne({
            userId: ctx.session.user._id,
            wishId: wish._id
        });
        await ctx.replyWithMarkdown(
            ctx.session.messages.findList.success.take +
                ctx.session.messages.findList.back,
            Markup.removeKeyboard()
        );

        return await setTimer(ctx, THIRD_WISHLIST);
    } catch (e) {
        return await onUnknownError(ctx, e);
    }
});

getStepFilterHandler(stepHandler);

filtersHandler.action(new RegExp(`${FILTER}_`), async ctx => {
    try {
        const action = ctx.update.callback_query.data;

        if (action === FILTER_RESET) {
            delete ctx.session.thirdWishlistFilter;

            await ctx.sendMessage(
                ctx.session.messages.filters.success.reset,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, THIRD_WISHLIST);
        }

        ctx.session.thirdWishlistFilter = parseInt(
            action.replace(`${FILTER}_`, '')
        );

        await ctx.sendMessage(
            ctx.session.messages.filters.success.set,
            Markup.removeKeyboard()
        );

        return await setTimer(ctx, THIRD_WISHLIST);
    } catch (e) {
        return await onUnknownError(ctx, e);
    }
});

const ThirdWishlist = new WizardScene(
    THIRD_WISHLIST,
    async ctx => {
        if (!ctx.session.thirdWishlist) {
            try {
                await ctx.sendMessage(
                    ctx.session.messages.errors.unknown,
                    Markup.removeKeyboard()
                );

                return await setTimer(ctx, FIND_LIST);
            } catch (e) {
                return await onUnknownError(ctx, e);
            }
        }

        const username = ctx.session.thirdWishlist.replace(/@/g, '');
        const phone = ctx.session.thirdWishlist.replace(/\D/g, '');
        const searchCriteria =
            phone && phone.length > 9
                ? {
                      $or: [
                          { username },
                          { phone: { $regex: new RegExp(phone) } }
                      ]
                  }
                : { username };

        try {
            const user = await User.findOne(searchCriteria);

            if (!user) {
                await ctx.sendMessage(
                    ctx.session.messages.findList.errors.notFound +
                        ctx.session.messages.findList.back,
                    Markup.removeKeyboard()
                );

                return await setTimer(ctx, FIND_LIST);
            }

            if (
                user._id.toString() === ctx.session.user._id.toString() &&
                user.telegramId.toString() !==
                    process.env.ADMIN_TELEGRAM_ID.toString()
            ) {
                await ctx.sendMessage(
                    ctx.session.messages.findList.errors.foundYourself +
                        ctx.session.messages.findList.back,
                    Markup.removeKeyboard()
                );

                return await setTimer(ctx, FIND_LIST);
            }

            const wishlist = await Wish.find({
                userId: user._id,
                hidden: {
                    $ne: true
                },
                removed: {
                    $ne: true
                },
                ...getPriceFilter(ctx, ctx.session.thirdWishlistFilter)
            }).sort({
                priority: -1,
                updatedAt: -1
            });

            if (!wishlist.length) {
                console.log(
                    'ctx.session.thirdWishlistFilter',
                    ctx.session.thirdWishlistFilter
                );
                if (
                    ctx.session.thirdWishlistFilter !== null &&
                    ctx.session.thirdWishlistFilter >= 0
                ) {
                    await ctx.sendMessage(
                        ctx.session.messages.findList.filtered,
                        Markup.inlineKeyboard(
                            [
                                Markup.button.callback(
                                    `${ctx.session.messages.filters.title} ${
                                        ctx.session?.thirdWishlistFilter !==
                                            null &&
                                        ctx.session?.thirdWishlistFilter >= 0
                                            ? '🟢'
                                            : '🔴'
                                    }`,
                                    FILTER
                                ),
                                Markup.button.callback(
                                    ctx.session.messages.actions.home,
                                    GREETING
                                )
                            ],
                            {
                                columns: 1
                            }
                        )
                    );

                    return ctx.wizard.next();
                } else {
                    await ctx.sendMessage(
                        ctx.session.messages.findList.empty,
                        Markup.removeKeyboard()
                    );

                    return await setTimer(ctx, FIND_LIST);
                }
            }

            await ctx.replyWithMarkdown(
                ctx.session.messages.findList.filled.before.replace(
                    '%1',
                    ctx.session.thirdWishlist
                ) +
                    (ctx.session?.thirdWishlistFilter !== null &&
                    ctx.session?.thirdWishlistFilter >= 0
                        ? ctx.session.messages.filters.applied.replace(
                              '%1',
                              getPriceFilterTitle(
                                  ctx,
                                  ctx.session.thirdWishlistFilter
                              )
                          )
                        : ''),
                Markup.removeKeyboard()
            );

            for await (const wish of wishlist) {
                const markup = await getWishMarkup(ctx, wish, false);

                if (!markup) continue;

                const givers = await Give.find({
                    wishId: wish._id
                });
                const existInGiveList = await Give.findOne({
                    userId: ctx.session.user._id,
                    wishId: wish._id
                });
                const buttons = [];

                if (givers.length === 1 && existInGiveList) {
                    markup.concat(ctx.session.messages.findList.givers.you);
                } else if (givers.length > 1 && existInGiveList) {
                    markup.concat(
                        ctx.session.messages.findList.givers.somebodyAndYou.replace(
                            '%1',
                            (givers.length - 1).toString()
                        )
                    );
                } else if (givers.length && !existInGiveList) {
                    markup.concat(
                        ctx.session.messages.findList.givers.somebody.replace(
                            '%1',
                            givers.length.toString()
                        )
                    );
                }

                if (wish.link) {
                    buttons.push(
                        Markup.button.url(
                            ctx.session.messages.actions.open,
                            wish.link
                        )
                    );
                }

                if (existInGiveList) {
                    buttons.push(
                        Markup.button.callback(
                            ctx.session.messages.findList.actions.take,
                            TAKE.concat(wish._id)
                        )
                    );
                } else {
                    buttons.push(
                        Markup.button.callback(
                            ctx.session.messages.findList.actions.give,
                            GIVE.concat(wish._id)
                        )
                    );
                }

                const extra = buttons.length
                    ? {
                          ...Markup.inlineKeyboard(buttons, {
                              columns: 1
                          })
                      }
                    : { ...Markup.removeKeyboard() };

                if (wish.images.length > 1) {
                    await ctx.sendMediaGroup(getMediaGroup(wish.images));
                } else if (wish.images.length === 1) {
                    await ctx.sendPhoto(wish.images[0], {
                        caption: markup,
                        parse_mode: 'MarkdownV2',
                        ...extra
                    });
                }

                if (wish.images.length !== 1) {
                    await ctx.replyWithMarkdownV2(markup, extra);
                }
            }

            if (user.payments) {
                await ctx.sendMessage(
                    ctx.session.messages.findList.filled.payments.replace(
                        '%1',
                        user.payments
                    ),
                    Markup.removeKeyboard()
                );
            }

            await ctx.sendMessage(ctx.session.messages.findList.filled.after, {
                ...Markup.inlineKeyboard(
                    [
                        Markup.button.callback(
                            `${ctx.session.messages.filters.title} ${
                                ctx.session?.thirdWishlistFilter !== null &&
                                ctx.session?.thirdWishlistFilter >= 0
                                    ? '🟢'
                                    : '🔴'
                            }`,
                            FILTER
                        ),
                        Markup.button.callback(
                            ctx.session.messages.actions.back,
                            FIND_LIST
                        ),
                        Markup.button.callback(
                            ctx.session.messages.actions.home,
                            GREETING
                        )
                    ],
                    {
                        columns: 1
                    }
                ),
                parse_mode: 'Markdown'
            });

            return ctx.wizard.next();
        } catch (e) {
            return await onUnknownError(ctx, e);
        }
    },
    stepHandler,
    filtersHandler
);

module.exports = ThirdWishlist;
