"use strict";

// Run jscs as part of normal testing
require('mocha-eslint')([
    'lib',
    'test'
]);

const Budgeteer = require('../lib/budgeteer');
const limiter = new Budgeteer({ host: 'localhost', port: 80 });
const equal = require('assert').equal;

// Monkey-patch private _redis object
function secAgo(n) {
    return Date.now() - n * 1000;
}

const testInfo = {
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
};

limiter._getInfo = function(key, limitConf) {
    return Promise.resolve(testInfo[key] || {
        last_success: 0,
        is_scheduled: false,
        token_balance: limitConf.initial_token_balance || 0,
    });
};

limiter._putInfo = function(key, info) {
    testInfo[key] = info;
    return Promise.resolve();
};

const limitConf = {
    initial_token_balance: 48,
    token_budget_per_day: 24,
};


module.exports = {
    check: {
        basic() {
            return limiter.check('a', limitConf)
            .then((res) => {
                equal(res.isDuplicate, false);
                equal(res.delay, 0);
                return limiter.check('a', limitConf, Date.now(), 20);
            })
            .then((res) => {
                equal(res.isDuplicate, false);
                equal(Math.round(res.delay / 5) * 5, 35990);
                return limiter.reportScheduled('a', limitConf, 0)
                .then(() => limiter.check('a', limitConf, Date.now(), 20));
            })
            .then((res) => {
                equal(res.isDuplicate, true);
                equal(res.delay, 0);
                return limiter.check('a', limitConf);
            })
            .then((res) => {
                equal(res.isDuplicate, false);
                equal(res.delay, 0);
                return limiter.reportSuccess('a', limitConf, Date.now(), 11)
                .then(() => limiter.check('a', limitConf));
            })
            .then((res) => {
                equal(res.isDuplicate, false);
                equal(Math.round(res.delay / 5) * 5, 3600);
            });
        }
    }
};

