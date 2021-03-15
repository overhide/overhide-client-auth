"use strict";

const Pool = require('pg').Pool;
const log = require('./log.js').fn("database");
const event = require('./log.js').fn("database-event");
const debug = require('./log.js').debug_fn("database");

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');
const logEvent = Symbol('logEvent');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Database {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  // use logging as DB event log (backup of sorts)
  //
  // @param {String} query -- to log
  // @param {*} params -- to log
  [logEvent](query, params) {   
    for (var i = 0; i < params.length; i++) {
      var param = params[i];
      query = query.replace(`$${i+1}`,`'${param}'`);
    }
    event(query);
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} pghost
   * @param {number} phport
   * @param {string} pgdatabase
   * @param {string} pguse
   * @param {string} pgpassword
   * @param {string} pgssl - true or false
   * @param {number} select_max_rows
   * @returns {Database} this
   */
  init({pghost,pgport,pgdatabase,pguser,pgpassword, pgssl, select_max_rows} = {}) {
    if (pghost == null) throw new Error("POSTGRES_HOST must be specified.");
    if (pgport == null) throw new Error("POSTGRES_PORT must be specified.");
    if (pgdatabase == null) throw new Error("POSTGRES_DB must be specified.");
    if (pguser == null) throw new Error("POSTGRES_USER must be specified.");
    if (pgpassword == null) throw new Error("POSTGRES_PASSWORD must be specified.");
    if (select_max_rows == null) throw new Error("SELECT_MAX_ROWS must be specified.");

    const db = new Pool({
      host: pghost,
      port: pgport,
      database: pgdatabase,
      user: pguser,
      password: pgpassword,
      ssl: pgssl
    });

    this[ctx] = {
      db: db,
      select_max_rows: select_max_rows
    };
    
    return this;
  }

  /**
   * Add a client
   * 
   * @param {string} apikey
   * @param {string} istest
   */
  async addClient(apikey, istest) {
    this[checkInit]();
    try {
      let query = `SELECT apikey FROM clients WHERE apikey = $1`;
      let params = [apikey];
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount > 0) {
        throw `this apikey is already registered with the ledger: ${providerAddress}`;
      }
      query = `INSERT INTO  clients (apikey, istest, isvalid) VALUES ($1, $2, true)`;
      params = [apikey, istest];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);
    } catch (err) {
      throw `insertion error :: ${String(err)}`;
    }
  }

  /**
   * @param {string} apikey
   * @returns {Object} with apikey, istest
   */
  async getClient(apikey) {
    this[checkInit]();
    try {
      let query = `SELECT * FROM clients WHERE apikey = $1 AND isvalid = true`;
      let params = [apikey];
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        return null
      }
      debug('%s,%o <= %o', query, params, result.rows[0]);
      return {
        apikey: result.rows[0].apikey,
        istest: result.rows[0].istest
      }
    } catch (err) {
      throw `retrieving client failed: ${String(err)}`;
    }
  }

  /**
   * Call when process is exiting.
   */
  async terminate() {
    this[checkInit]();
    debug(`terminating`);
    await this[ctx].db.end();
  }

  /**
   * @returns {string} null if no error else error string if problem using DB from connection pool.
   */
  async getError() {
    this[checkInit]();
    try {
      var client = await this[ctx].db.connect();
      const res = await client.query('SELECT NOW()');
      return null;
    } catch (err) {
      log(`not healthy: ${String(err)}`);
      return String(err);
    } finally {
      if (client) client.release()
    }    
  }
}

module.exports = (new Database());