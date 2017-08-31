"use strict";

const P = require('bluebird');
const redis = require('redis');

class RedisClient {
    constructor(options) {
        if (!options) {
            throw new Error('Redis options not provided to the rate_limiter');
        }

        if (!(options.host && options.port)
            && !options.path) {
            throw new Error('Redis host:port or unix socket path must be specified');
        }

        options = Object.assign(options, {
            no_ready_check: true // Prevents sending unsupported info command to nutcracker
        });
        // TODO: Wait for startup?
        this._redis = P.promisifyAll(redis.createClient(options));
        this._redis.on('error', (e) => {
            // If we can't connect to redis - don't worry and don't fail,
            // just log it and ignore.
            options.log('error/redis', e);
        });
    }

    put(key, value) {
        return this._redis.setnxAsync(key, value);
    }

    get(key) {
        return this._redis.getAsync(key);
    }

    close() {
        this._redis.quit();
    }
}

class Budgeteer {

    constructor(conf) {
        this._conf = conf;
        this._store = new RedisClient(conf);
    }

    check(key, limitConf, jobTimestamp = Date.now(), cost = 0) {
        if (!limitConf) {
            throw new Error("limitConf missing!");
        }
        return this._getInfo(key, limitConf)
        .then((info) => {
            if (info.last_success > jobTimestamp) {
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
                        delay: -1 * newBalance / limitConf.token_budget_per_day * 86400,
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
                newBalance = Math.max(newBalance * 2,
                    -1 * (limitConf.max_delay_days || 7) * limitConf.token_budget_per_day);
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
                    token_balance: limitConf.initial_token_balance,
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
            * limitConf.token_budget_per_day;
        return info.token_balance
            + Math.min(limitConf.initial_token_balance, Math.max(0, recharge))
            - cost;
    }
}

module.exports = Budgeteer;


