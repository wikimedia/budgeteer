"use strict";

// Run jscs as part of normal testing
require('mocha-eslint')([
    'lib',
    'test'
]);

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
// Deep copy, so that we can update the in-memory state.
const testState = JSON.parse(JSON.stringify(basicTests.state));

// Monkey patch the limiter. TODO: Make this a dedicated backend.
limiter._getInfo = function(key, budget) {
    return Promise.resolve(testState[key] || {
        last_success: 0,
        is_scheduled: false,
        token_balance: budget.initial_token_balance || 0,
    });
};

limiter._putInfo = function(key, info) {
    testState[key] = info;
    return Promise.resolve();
};


module.exports = {
    in_memory: basicTests.cases
};

