'use strict';

const equal = require('assert').equal;

function secAgo(n) {
    return Date.now() - n * 1000;
}

const budget = {
    tokens_per_day: 24,
    max_balance: 48,
};

module.exports = function(limiter) {
    return {
        state: {
            a: {
                last_success: secAgo(10),
                is_scheduled: false,
                token_balance: 10,
            },
            b: {
                last_success: secAgo(86400),
                is_scheduled: false,
                token_balance: 0,
            },
        },
        cases: {
            basic_check() {
                return limiter.check('a', budget)
                .then((res) => {
                    equal(res.isDuplicate, false);
                    equal(res.delay, 0);
                    return limiter.check('a', budget, Date.now(), 20);
                })
                .then((res) => {
                    equal(res.isDuplicate, false);
                    equal(Math.round(res.delay / 5) * 5, 35990);
                    return limiter.reportScheduled('a', budget, 0)
                    .then(() => limiter.check('a', budget, Date.now(), 20));
                })
                .then((res) => {
                    equal(res.isDuplicate, true);
                    equal(res.delay, 0);
                    return limiter.check('a', budget);
                })
                .then((res) => {
                    equal(res.isDuplicate, false);
                    equal(res.delay, 0);
                    return limiter.reportSuccess('a', budget, Date.now(), 11)
                    .then(() => limiter.check('a', budget));
                })
                .then((res) => {
                    equal(res.isDuplicate, false);
                    equal(Math.round(res.delay / 5) * 5, 3600);
                    return limiter.check('a', budget, Date.now() - 500);
                })
                .then(res => equal(res.isDuplicate, true));
            }
        }
    };
};

