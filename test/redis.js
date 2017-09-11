'use strict';

const Budgeteer = require('../lib/budgeteer');
const limiter = new Budgeteer({
    store: {
        type: 'redis',
        host: 'localhost',
        port: 6379,
        ttl: 86400 * 7 // 7 days
    }
});

const makeTestCases = require('./share/basic_testcases');
const basicTests = makeTestCases(limiter);

module.exports = {
    before() {
        return limiter._putInfo('a', basicTests.state.a)
        .then(() => limiter._putInfo('b', basicTests.b));
    },
    redis: basicTests.cases
};

