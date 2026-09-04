const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    // Multi-step operations must use one checked-out client. Calling BEGIN,
    // CALL and COMMIT through pool.query can otherwise use different pooled
    // connections and would not be one real database transaction.
    connect: () => pool.connect(),
};
