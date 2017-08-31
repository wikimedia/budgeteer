# budgeteer
Cost-based request rate limiter, scheduler, and deduplicator. Uses a Redis
backend. Provides the "brain" of a simple job scheduling system.

Features:

- Request deduplication: Requests that have already been executed, or are
    scheduled for delayed execution, are dropped.
- Cost based accounting, giving each request key a token budget per day. Clients 
    are free to model costs any way they like. Typically, execution time (in
    seconds) is a major input into the cost function.
- Delay and retry scheduling: An execution delay is calculated once a job's
    budget turns negative. The delay is proportional to the time it takes to
    even out the budget, based on the `token_budget_per_day` configuration
    option.

## Usage example

```javascript
const budgeteer = new Budgeteer({ host: 'redishost', port: 12345 });
const key = 'someName';

// Budget configuration, typically per request type.
const budget = {
    initial_token_balance: 40,
    token_budget_per_day: 24,
};

return budgeteer.check(key, budget, req.startTime)
.then(res => {
    if (res.isDuplicate) {
        // Duplicate. Drop the job.
        return;
    }
    if (res.delay) {
        // add job to a (Kafka) delay queue, based on the suggested delay.
        return enqueueToDelayQueue(job, delay)
        // Redis read / write.
        .then(() => budgeteer.reportScheduled(key, budget, 0);
    } else {
        const startTime = Date.now();
        // execute job
        return job()
        // Redis read / write.
        .then(() => budgeteer.reportSuccess(key, budget, startTime, (Date.now() - startTime) / 1000))
        .catch(e => {
            // Time plus some failure penalty
            const cost = (Date.now() - startTime) / 1000 + 1;
            return budgeteer.check(key, budget, req.startTime, cost)
            .then(res => {
                if (!res.isDuplicate) {
                    delay = Math.max(delay, 200);
                    return enqueueToDelayQueue(job, delay)
                    // Redis read / write.
                    .then(() => budgeteer.reportScheduled(key, budget, cost));
                }
            });
        })
    }
})
```
