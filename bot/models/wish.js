const { Schema, model } = require('mongoose');

module.exports = model(
    'Wish',
    new Schema(
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: 'User'
            },
            title: {
                type: String,
                required: true
            },
            description: String,
            link: String,
            images: [
                {
                    type: String
                }
            ],
            priority: {
                type: Boolean,
                default: false
            },
            price: {
                type: Number,
                default: 0
            },
            hidden: {
                type: Boolean,
                default: false
            },
            removed: {
                type: Boolean,
                default: false
            },
            done: {
                type: Boolean,
                default: false
            }
        },
        {
            timestamps: true
        }
    )
);
