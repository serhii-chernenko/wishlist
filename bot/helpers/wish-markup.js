const { getDate } = require('./intl');
const { getCutText, textLimitTypes } = require('./cut-text');
const { getCurrency } = require('./intl');
const { escapeMarkdownV2 } = require('./markdown-v2-escaper');

module.exports = async (
    ctx,
    wish,
    owner = true,
    onlyTitleAndDate = false,
    showHidden = false
) => {
    try {
        if (!wish) return '';

        const created = escapeMarkdownV2(getDate(ctx, wish.createdAt), ['_']);
        const updated = escapeMarkdownV2(getDate(ctx, wish.updatedAt), ['_']);
        const showEditDate = created !== updated;
        const editDate = showEditDate
            ? ctx.session.messages.markup.date.updated.replace('%1', updated)
            : '';
        const createdDate = ctx.session.messages.markup.date.created.replace(
            '%1',
            created
        );
        const title = escapeMarkdownV2(
            ctx.session.messages.markup.title.replace(
                '%1',
                getCutText(wish.title)
            ),
            ['*']
        );
        const hidden =
            wish.hidden && showHidden
                ? escapeMarkdownV2(ctx.session.messages.markup.hidden, ['_'])
                : '';

        const price =
            wish.price > 0
                ? escapeMarkdownV2(
                      ctx.session.messages.markup.price.replace(
                          '%1',
                          getCurrency(ctx, wish.price)
                      ),
                      ['*']
                  )
                : '';

        if (onlyTitleAndDate) {
            return (
                title +
                price +
                (editDate ? `\n${editDate}` : createdDate) +
                hidden
            );
        }

        let priority = '';
        const description = wish.description
            ? escapeMarkdownV2(
                  ctx.session.messages.markup.description.replace(
                      '%1',
                      getCutText(wish.description, textLimitTypes.DESCRIPTION)
                  )
              )
            : '';

        if (wish.priority) {
            priority = escapeMarkdownV2(
                owner
                    ? ctx.session.messages.markup.priority.owner
                    : ctx.session.messages.markup.priority.watcher,
                ['*', '>']
            );
        }

        return (
            title +
            priority +
            description +
            price +
            createdDate +
            editDate +
            hidden
        );
    } catch (e) {
        throw e;
    }
};
