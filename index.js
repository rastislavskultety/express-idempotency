'use strict';

var debug = require('debug')('express-idempotency');
var connect = require('connect');
var expressEnd = require('express-end');

var cache = require('./lib/cache-provider');
var generateCacheKey = require('./lib/generate-cache-key');

/**
 * Express middleware
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */

var default_options = {
    cacheHeader: "cached-result",
    cacheHeaderValue: "1"
}

module.exports = function (opt) {

    var options = Object.assign({}, default_options, opt);

 function wrap(orig) {
     return function (obj) {
         this.__body = obj;
         orig.apply(this, arguments)
         console.log("#wrap - before! ", this.__body);
         orig(obj);
         console.log("#wrap - after!");
         console.log("obj: ", obj);
     };
   }

function monkey(obj) {

}

var checkMw = function(req, res, next) {
    console.log("#checkMw");

    if (!res.__isJSONWrapped) {
        // res.__json = res.json;
        // res.__jsonp = res.jsonp;
            res.json = wrap(res.json);
        // if (req.jsonp) res.jsonp = wrap.bind(res.jsonp.bind(res));
        res.__isJSONWrapped = true;
    }

  var idempotencyKey = req.get('Idempotency-Key');

  if (!idempotencyKey) {
    return next();
  }

  const cacheKey = generateCacheKey(req, idempotencyKey);
  const storedResponse = cache.get(cacheKey);

  if (!storedResponse) {
    return next();
  }

  res.status(storedResponse.statusCode);
  res.set(storedResponse.headers);
  res.set(options.cacheHeader, options.cacheHeaderValue); // indicate this was served from cache
  res.send(storedResponse.__body);
}

/**
 * Express middleware to store a resposne against a supplied idempotency token
 * in the cache.
 * @param {object} req Express request
 * @param {object} res Express response
 * @param {function} next Express next callback function
 */
function storeMw(req, res, next) {
    console.log("#storeMw");
  res.once('end', () => {
      console.log("#storeMw.end");
    const idempotencyKey = req.get('Idempotency-Key');
    if (idempotencyKey) {
      const responseToStore = {
        statusCode: res.statusCode,
        body: res.__body,
        headers: res._headers,
      };

      console.log("res.__body ", res.body);
      console.log("responseToStore ", responseToStore);
      const cacheKey = generateCacheKey(req, idempotencyKey);
      cache.set(cacheKey, responseToStore)
      debug('stored response against idempotency key: ', idempotencyKey);
    }
  });
  return next();
}

  // chain pattern from helmet - see https://github.com/helmetjs/helmet/blob/master/index.js
  var chain = connect();
  chain.use(expressEnd);
  chain.use(checkMw);
  chain.use(storeMw);
  return chain;
}
