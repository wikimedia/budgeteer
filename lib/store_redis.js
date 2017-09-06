'use strict';

const P = require('bluebird');
const redis = require('redis');

class RedisStore {
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
        // Default TTL: 7 days
        const ttl = this.options.ttl || 86400 * 7;
        return this._redis.setexAsync(key, ttl, value);
    }

    get(key) {
        return this._redis.getAsync(key);
    }

    close() {
        this._redis.quit();
    }
}

module.exports = RedisStore;
