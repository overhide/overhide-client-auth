const allow_cors = require('cors')();
const http = require('http');
const express = require('express');
const {createTerminus: terminus, HealthCheckError} = require('@godaddy/terminus');
const ejs = require('ejs');
const os = require('os');
const path = require('path');
const utils = require('./lib/utils.js');

// CONFIGURATION CONSTANTS
//
// Try fetching from environment first (for Docker overrides etc.) then from npm config; fail-over to 
// hardcoded defaults.
const APP_NAME = "overhide-client-auth";
const VERSION = process.env.npm_package_version;
const PROTOCOL = process.env.PROTOCOL || process.env.npm_config_PROTOCOL || process.env.npm_package_config_PROTOCOL;
const BASE_URL = process.env.BASE_URL || process.env.npm_config_BASE_URL || process.env.npm_package_config_BASE_URL;
const PORT = process.env.PORT || process.env.npm_config_PORT || process.env.npm_package_config_PORT || 8100;
const DEBUG = process.env.DEBUG || process.env.npm_config_DEBUG || process.env.npm_package_config_DEBUG;
const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || process.env.npm_config_RATE_LIMIT_WINDOW_MS || process.env.npm_package_config_RATE_LIMIT_WINDOW_MS || 60000;
const RATE_LIMIT_MAX_REQUESTS_PER_WINDOW = process.env.RATE_LIMIT_MAX_REQUESTS_PER_WINDOW || process.env.npm_config_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW || process.env.npm_package_config_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW || 10;
const RATE_LIMIT_REDIS_URI = process.env.RATE_LIMIT_REDIS_URI || process.env.npm_config_RATE_LIMIT_REDIS_URI || process.env.npm_package_config_RATE_LIMIT_REDIS_URI || null;
const RATE_LIMIT_REDIS_NAMESPACE = process.env.RATE_LIMIT_REDIS_NAMESPACE || process.env.npm_config_RATE_LIMIT_REDIS_NAMESPACE || process.env.npm_package_config_RATE_LIMIT_REDIS_NAMESPACE || "rate-limit";
const POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.npm_config_POSTGRES_HOST || process.env.npm_package_config_POSTGRES_HOST || 'localhost'
const POSTGRES_PORT = process.env.POSTGRES_PORT || process.env.npm_config_POSTGRES_PORT || process.env.npm_package_config_POSTGRES_PORT || 5432
const POSTGRES_DB = process.env.POSTGRES_DB || process.env.npm_config_POSTGRES_DB || process.env.npm_package_config_POSTGRES_DB;
const POSTGRES_USER = process.env.POSTGRES_USER || process.env.npm_config_POSTGRES_USER || process.env.npm_package_config_POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.npm_config_POSTGRES_PASSWORD || process.env.npm_package_config_POSTGRES_PASSWORD;
const POSTGRES_SSL = process.env.POSTGRES_SSL || process.env.npm_config_POSTGRES_SSL || process.env.npm_package_config_POSTGRES_SSL;
const SELECT_MAX_ROWS = process.env.SELECT_MAX_ROWS || process.env.npm_config_SELECT_MAX_ROWS || process.env.npm_package_config_SELECT_MAX_ROWS;
const INSIGHTS_KEY = process.env.INSIGHTS_KEY || process.env.npm_config_INSIGHTS_KEY || process.env.npm_package_config_INSIGHTS_KEY
const SALT = process.env.SALT || process.env.npm_config_SALT || process.env.npm_package_config_SALT;
const TOKEN_VALIDITY_SECONDS = process.env.TOKEN_VALIDITY_SECONDS || process.env.npm_config_TOKEN_VALIDITY_SECONDS || process.env.npm_package_config_TOKEN_VALIDITY_SECONDS || 86400;
const RECAPTCHA_URI = process.env.RECAPTCHA_URI || process.env.npm_config_RECAPTCHA_URI || process.env.npm_package_config_RECAPTCHA_URI;
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || process.env.npm_config_RECAPTCHA_SITE_KEY || process.env.npm_package_config_RECAPTCHA_SITE_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || process.env.npm_config_RECAPTCHA_SECRET_KEY || process.env.npm_package_config_RECAPTCHA_SECRET_KEY;
const URI = `${PROTOCOL}://${BASE_URL}`;
const DOMAIN = BASE_URL.split(':')[0];

// Wire up application context
const ctx_config = {
  pid: process.pid,
  app_name: APP_NAME,
  version: VERSION,
  base_url: BASE_URL,
  swagger_endpoints_path: __dirname + path.sep + 'index.js',
  uri: URI,
  port: PORT,
  debug: DEBUG,
  rateLimitWindowsMs: RATE_LIMIT_WINDOW_MS,
  rateLimitMax: RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  rateLimitRedis: RATE_LIMIT_REDIS_URI,
  rateLimitRedisNamespace: RATE_LIMIT_REDIS_NAMESPACE,
  pghost: POSTGRES_HOST,
  pgport: POSTGRES_PORT,
  pgdatabase: POSTGRES_DB,
  pguser: POSTGRES_USER,
  pgpassword: POSTGRES_PASSWORD,
  pgssl: !!POSTGRES_SSL,
  select_max_rows: SELECT_MAX_ROWS,
  insights_key: INSIGHTS_KEY,
  salt: SALT,
  recaptcha_uri: RECAPTCHA_URI,
  recaptcha_site_key: RECAPTCHA_SITE_KEY,
  recaptcha_secret_key: RECAPTCHA_SECRET_KEY
};
const log = require('./lib/log.js').init(ctx_config).fn("app");
const debug = require('./lib/log.js').init(ctx_config).debug_fn("app");
const insights_key = require('./lib/insights.js').init(ctx_config);
const crypto = require('./lib/crypto.js').init();
const recaptcha = require('./lib/recaptcha.js').init(ctx_config);
const database = require('./lib/database.js').init(ctx_config);
const swagger = require('./lib/swagger.js').init(ctx_config);
const throttle = require('./lib/throttle.js').check.bind(require('./lib/throttle.js').init(ctx_config));
log("CONFIG:\n%O", ((cfg) => {
  cfg.insights_key = cfg.insights_key ? cfg.insights_key.replace(/.(?=.{2})/g,'*') : null; 
  cfg.pgpassword = cfg.pgpassword.replace(/.(?=.{2})/g,'*'); 
  cfg.salt = cfg.salt.replace(/.(?=.{2})/g,'*'); 
  cfg.recaptcha_secret_key = cfg.recaptcha_secret_key.replace(/.(?=.{2})/g,'*'); 
  return cfg;
})({...ctx_config}));

var RENDER_PARAMS = {
  uri: URI,
};

// MIDDLEWARE

const app = express();
app.use(express.static(__dirname + `${path.sep}..${path.sep}static`));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.set('views', __dirname + `${path.sep}..${path.sep}static`);
app.engine('html', ejs.renderFile);
app.engine('template', ejs.renderFile);
app.use(allow_cors);

// ROUTES

app.get('/swagger.json', throttle, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swagger.render());
});

app.get('/register', throttle, (req, res) => {
  log('register');
  res.render('register.html', { ...RENDER_PARAMS, sitekey: RECAPTCHA_SITE_KEY }); 
});

/**
 * @swagger
 * /token:
 *   get:
 *     summary: Retrieve token for use with other overhide services and libraries.
 *     description: | 
 *       Retrieve token for use with other *overhide* services and libraries.
 *     parameters:
 *       - in: query
 *         name: apikey
 *         required: true
 *         type: string
 *         description: |
 *            Per-app API key for requesting and refreshing tokens.  Register for an API key via https://token.overhide.io/register.
 *     produces:
 *       - text/plain
 *     responses:
 *       200:
 *         description: token as a text string.
 *       401:
 *         description: bad API key provided.
 *       403:
 *         description: the API key has been blacklisted and will not be issued a token.  
 */
app.get('/token', throttle, async (req, res, next) => {
  (async () => {
    try {
      var query = req.query;
      debug('GET /token <= %o', query);
      let apikey = query['apikey'];
      if (!apikey || typeof apikey !== 'string') throw `invalid API key, please register for an API key at https://token.overhide.io/register`;
      if (!await database.getError()) {
        var result = await database.getClient(apikey);  
      }    
      if (result) {
        var token = crypto.symmetricEncrypt(JSON.stringify({
          ...result, 
          token_validity_seconds: TOKEN_VALIDITY_SECONDS, 
          created: (new Date()).toISOString()}), SALT).toString('base64');
        token = encodeURIComponent(token);
        res.status(200).send(token);          
      } else {
        debug('GET /token <= %o ERROR :: not found', query);
        res.status(404).send();
      }
    }
    catch (err) {
        debug('GET /token <= %o ERROR :: %s', query, err);
        res.status(400).send(String(err));
    }
    next();
  })();
});

/**
 * @swagger
 * /validate:
 *   get:
 *     summary: Get validation status of token retrieved through GET /token.
 *     description: | 
 *       Get validation status of token retrieved through GET /token.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         type: string
 *         description: |
 *            The token to check.  Use GET /token API after your register for an API key at https://token.overhide.io/register.
 *       - in: query
 *         name: istest
 *         required: true
 *         type: string
 *         description: |
 *            'true' if this is a test-environment token: retrieved for a test-only API key.
 *     produces:
 *       - text/plain
 *     responses:
 *       200:
 *         description: Valid token.
 *       401:
 *         description: Invalid token.
 */
app.get('/validate', throttle, (req, res, next) => {
  (async () => {
    try {
      var query = req.query;
      debug('GET /validate <= %o', query);
      let token = query['token'];
      let istest = 'istest' in query && query['istest'] && query['istest'].toLowerCase() == 'true';
      if (!token || typeof token !== 'string') throw `invalid token, please register for an API key at https://token.overhide.io/register and use GET /token on it.`;
      token = decodeURIComponent(token);
      try {
        token = new Buffer(token, 'base64');  
        token = crypto.symmetricDecrypt(token, SALT);
        token = JSON.parse(token);
        if (istest !== token['istest']) {
          res.status(401).send(`evironment mismatch (test token:${token['istest']})(test environment:${istest})`);
          next();
          return;
        }
        if ((((new Date()) - Date.parse(token['created'])) / 1000) > TOKEN_VALIDITY_SECONDS) {
          res.status(401).send(`token expired`);
          next();
          return;
        }
        if (!await database.getError()) {
          var result = await database.getClient(token['apikey']);  
        }
        if (!result) {
          res.status(401).send(`invalid apikey`);
          next();
          return;
        }
        res.status(200).send();
      }
      catch (err) {
        res.status(401).send('bad token');
      }
    }
    catch (err) {
        debug('GET /token <= %o ERROR :: %s', query, err);
        res.status(400).send(String(err));
    }
    next();
  })();
});

app.post('/register', (req, res, next) => {
  (async () => {
    try {
      var body = req.body;
      debug('POST /register <= %o', body);
      let recaptchaResult = body['recaptchaResult'];
      let isTestOnly = !!body['isTestOnly'];
      if (!recaptchaResult || typeof recaptchaResult !== 'string') throw `invalid recaptchaResult, must be a string`;
      var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      await recaptcha.verify(ip, recaptchaResult);
      const apikey = utils.newKey();
      if (!await database.getError()) {
        await database.addClient(apikey, isTestOnly);  
      }
      debug('POST /register OK');
      res.render('apikey.html', { 
        apikey: apikey,
        isTestOnly: isTestOnly
      });
    }
    catch (err) {
        debug('POST /register <= %o ERROR :: %s', body, err);
        res.status(400).send(String(err));
        next();
    }  
  })();
});

// SERVER LIFECYCLE

const server = http.createServer(app);

function onSignal() {
  log('terminating: starting cleanup');
  return Promise.all([
    database.terminate()
  ]);
}

async function onHealthCheck() {
  let dbError = await database.getError();
  if (dbError) {
    log('DB ERROR :: ' + dbError);
    throw new HealthCheckError('healtcheck failed', [dbError])
  }
  let status = {
    host: os.hostname(),
    version: VERSION,
    database: 'OK'
  };
  return status;
}

terminus(server, {
  signal: 'SIGINT',
   healthChecks: {
    '/status.json': onHealthCheck,
  },
  onSignal
});

server.listen(PORT);