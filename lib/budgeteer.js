'use strict';

const RedisStore = require('./store_redis');

class Budgeteer {

    constructor(conf) {
        this._conf = conf;
        if (!conf.store) {
            throw new Error('Expected a store config!');
        }
        if (!conf.store.type || conf.store.type === 'redis') {
            this._store = new RedisStore(conf.store);
        } else {
            throw new Error(`Unknown store type: ${conf.store.type}`);
        }
    }

    check(key, limitConf, eventTimestamp = Date.now(), cost = 0) {
        if (!limitConf) {
            throw new Error("limitConf missing!");
        }
        return this._getInfo(key, limitConf)
        .then((info) => {
            if (info.last_success > eventTimestamp) {
                // Has already been executed.
                return {
                    isDuplicate: true,
                    delay: 0,
                };
            }
            const newBalance = this._calculateBalance(info, limitConf, cost);
            if (newBalance < 0) {
                if (info.is_scheduled) {
                    return {
                        isDuplicate: true,
                        delay: 0,
                    };
                } else {
                    return {
                        isDuplicate: false,
                        delay: -1 * newBalance / limitConf.tokens_per_day * 86400,
                    };
                }
            } else {
                return {
                    isDuplicate: false,
                    delay: 0,
                };
            }
        });
    }

    reportSuccess(key, limitConf, startTime, cost = 1) {
        // Update last_success to startTime; update balance with prorated - cost
        return this._getInfo(key, limitConf)
        .then((info) => {
            info.last_success = startTime;
            info.token_balance = this._calculateBalance(info, limitConf, cost);
            info.is_scheduled = false;
            return this._putInfo(key, info);
        });
    }

    reportScheduled(key, limitConf, cost = 1) {
        return this._getInfo(key, limitConf)
        .then((info) => {
            info.is_scheduled = true;

            let newBalance = info.token_balance - cost;
            if (newBalance < 0) {
                // Exponential back-off once we are in debit, but no more than
                // a maximum delay.
                newBalance *= 2;
            }
            info.token_balance = newBalance;
            return this._putInfo(key, info);
        });
    }

    close() {
        return this._store.close();
    }

    /**
     * Private helpers
     */

    _getInfo(key, limitConf) {
        return this._store.get(key)
        .then((redisInfo) => {
            if (redisInfo) {
                // TODO: Use something more efficient than JSON.
                return JSON.parse(redisInfo);
            } else {
                return {
                    last_success: 0,
                    is_scheduled: false,
                    token_balance: limitConf.max_balance,
                };
            }
        });
    }

    _putInfo(key, info) {
        // TODO: Use something more efficient than JSON.
        return this._store.put(key, JSON.stringify(info));
    }

    _calculateBalance(info, limitConf, cost) {
        const recharge = (Date.now() - info.last_success)
            / 1000 // -> seconds
            / 86400 // -> days
            * limitConf.tokens_per_day;
        return info.token_balance
            + Math.min(limitConf.max_balance, Math.max(0, recharge))
            - cost;
    }
}

module.exports = Budgeteer;
