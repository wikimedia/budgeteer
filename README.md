# budgeteer
Cost-based event rate limiter, scheduler, and deduplicator. Uses a Redis
backend. Provides the "brain" of a simple job scheduling system.

Features:

- Event deduplication: Events that have already been processed, or are
    scheduled for delayed processing, are dropped.
- Cost based accounting, giving each key a token budget per day. Clients 
    are free to model costs any way they like. Typically, execution time (in
    seconds) is a major input into the cost function.
- Delay and retry scheduling: An execution delay is calculated once an event's
    budget turns negative. The delay is proportional to the time it takes to
    even out the budget, based on the `token_budget_per_day` configuration
    option.

## Usage example

```javascript
const budgeteer = new Budgeteer({ 
    store: {
        type: 'redis', // Default & only supported storage type so far.
        host: 'redishost', 
        port: 12345,
        ttl: 86400 * 7 // Store rate limiting / dedup information for 7 days
    }
});
const key = 'someName';

// Token budget configuration, typically differs per event type.
const token_budget = {
    tokens_per_day: 24, // Steady state token rate.
    max_balance: 36   // Maximum balance available for bursts, when a job is
                      // new or has not been executed in a long time.
};

return budgeteer.check(key, token_budget, req.startTime)
.then(res => {
    if (res.isDuplicate) {
        // Duplicate. Drop the event.
        return;
    }
    if (res.delay) {
        // add event to a (Kafka) delay queue, based on the suggested delay.
        return enqueueToDelayQueue(event, delay)
        // Redis read / write.
        .then(() => budgeteer.reportScheduled(key, token_budget, 0);
    } else {
        const startTime = Date.now();
        // execute event
        return process_event(event)
        // Redis read / write.
        .then(() => budgeteer.reportSuccess(key, token_budget, startTime, (Date.now() - startTime) / 1000))
        .catch(e => {
            // Time plus some failure penalty
            const cost = (Date.now() - startTime) / 1000 + 1;
            return budgeteer.check(key, token_budget, req.startTime, cost)
            .then(res => {
                if (!res.isDuplicate) {
                    // We choose to enforce a minimum retry delay of 200 seconds.
                    delay = Math.max(delay, 200);
                    return enqueueToDelayQueue(event, delay)
                    // Redis read / write.
                    .then(() => budgeteer.reportScheduled(key, token_budget, cost));
                }
            });
        })
    }
})
```
