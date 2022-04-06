"use strict";

const path = require('path');
const jsyaml = require('js-yaml');
const swaggerJSDoc = require('swagger-jsdoc');

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Swagger {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (!this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} base_url - URI at which Swagger docs are being served
   * @param {string} swagger_endpoints_path - path to file with annotated endpoints for more API definitions
   * @param {string} uri
   * @returns {Swagger} this
   */
  init({ base_url, swagger_endpoints_path, uri } = {}) {
    if (base_url == null) throw new Error("URL must be specified.");
    if (swagger_endpoints_path == null) throw new Error("Swagger endpoints_path must be specified.");
    if (uri == null) throw new Error("URI must be specified.");

    this[ctx] = {
      base_url: base_url,
      path: swagger_endpoints_path,
      uri: uri
    };
    return this;
  }

  /**
   * @returns {string} rendered Swagger jsoon
   */
  render() {
    this[checkInit]();

    let yaml = `
      swaggerDefinition: 
        swagger: '2.0'
        host: ${this[ctx].base_url}
        basePath: /
        info:
          description: |    
            <hr/>         
            <a href="https://overhide.io" target="_blank">overhide.io</a> is a free and fully open-sourced ecosystem of widgets, a front-end library, and back-end services &mdash; to make addition of "logins" and "in-app-purchases" (IAP) to your app as banal as possible.
            <hr/><br/>          
          
            This  is an API to retrieve a token for use with other *overhide* services.

            Use of the token with other *overhide* services is usually abstracted on the front-end by providing it to [our widgets](https://github.com/overhide/overhide-widgets) which provide them to the [ledgers.js](https://github.com/overhide/ledgers.js) library.  The [ledgers.js](https://github.com/overhide/ledgers.js) library calls the services from the browser.

            You will call this service from your back-end, providing your API key, and forwarding the retrieved token to your front-end.

            Neither the API key nor the token retrieved with the key are authenticated secrets.  These are authorizing claims for use of the *overhide* systems.  They're used to allow the system to revoke session or -- if necessary -- application access to the system, in case of detected abuse.
            
            If the token stops working, subsequent sessions will continue to work.

            If your API key stops working, re-think how you use one.  Recreate one at https://token.overhide.io/register.  

            Reach out at https://www.reddit.com/r/overhide/.
            
          version: 1.0.0
          title: overhide-token API
          contact:
            name: r/overhide (reddit)
            url: https://www.reddit.com/r/overhide/
          externalDocs:
            description: The main Web page.
            url: 'https://overhide.io'
        responses:
          400:
            description: |
              A bad request from the client.
          401:
            description: Authentication information is missing or invalid
            headers:
              WWW_Authenticate:
                type: string
          403:
            description: Forbidden, your API key has been revoked.
          429:
            description: |
              Client is calling the API too frequently.
      apis: 
        - ${this[ctx].path}
    `;
    return swaggerJSDoc(jsyaml.safeLoad(yaml));
  }

}

module.exports = (new Swagger());