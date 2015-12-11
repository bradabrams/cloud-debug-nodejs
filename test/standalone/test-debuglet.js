/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var assert = require('assert');
var request = require('request');
var logger = require('@google/cloud-diagnostics-common').logger;
var config = require('../../config.js');
var Debuglet = require('../../lib/debuglet.js');

var nock = require('nock');
nock.disableNetConnect();

describe(__filename, function(){
  it('should not start unless we know the project num', function(done) {
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    delete process.env.GCLOUD_PROJECT_NUM;
    var scope = nock('http://metadata.google.internal')
      .get('/computeMetadata/v1/project/numeric-project-id')
      .reply(404);

    debuglet.once('error', function(err) {
      assert(err);
      debuglet.stop();
      scope.done();
      done();
    });
    debuglet.once('started', function() {
      assert.fail();
    });
    debuglet.start();
  });

  it('should complain if GCLOUD_PROJECT_NUM is not numeric', function(done) {
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    process.env.GCLOUD_PROJECT_NUM='11020304f2934';

    debuglet.once('error', function(err) {
      assert(err);
      assert(err.message.indexOf('should be numeric') !== -1);
      debuglet.stop();
      done();
    });
    debuglet.once('started', function() {
      assert.fail();
    });
    debuglet.start();
  });

  it('should error if a package.json doesn\'t exist');

  it('should register successfully otherwise', function(done) {
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    process.env.GCLOUD_PROJECT_NUM=0;

    var API = 'https://clouddebugger.googleapis.com';
    var PATH = '/v2/controller/debuggees/register';
    var scope = nock(API)
      .post(PATH)
      .reply(200, {
        debuggee: {
          id: 'foo'
        }
      });

    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
    debuglet.once('registered', function(id) {
      assert(id === 'foo');
      debuglet.stop();
      scope.done();
      done();
    });

    debuglet.start();
  });

  it('should de-activate when the server responds with isDisabled');

  it('should re-register when registration expires');

  it('should fetch breakpoints');

  it('should re-fetch breakpoints on error', function(done) {
    this.timeout(6000);
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    process.env.GCLOUD_PROJECT_NUM=0;

    var API = 'https://clouddebugger.googleapis.com';

    var scope = nock(API)
      .post('/v2/controller/debuggees/register')
      .reply(200, {
        debuggee: {
          id: 'bar'
        }
      })
      .post('/v2/controller/debuggees/register')
      .reply(200, {
        debuggee: {
          id: 'bar'
        }
      })
      .get('/v2/controller/debuggees/bar/breakpoints')
      .reply(404)
      .get('/v2/controller/debuggees/bar/breakpoints')
      .reply(409)
      .get('/v2/controller/debuggees/bar/breakpoints')
      .reply(200, {
        breakpoints: [{
          id: 'test',
          location: { path: 'fixtures/foo.js', line: 2 }
        }]
      });

    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
    debuglet.once('registered', function reg(id) {
      assert(id === 'bar');
      setTimeout(function() {
        assert.deepEqual(debuglet.activeBreakpointMap_.test, {
          id: 'test',
          location: { path: 'fixtures/foo.js', line: 2 }
        });
        debuglet.stop();
        scope.done();
        done();
      }, 1000);
    });

    debuglet.start();
  });

  it('should add a breakpoint');

  it('should expire stale breakpoints', function(done) {
    var oldTimeout = config.breakpointExpirationSec;
    config.breakpointExpirationSec = 1;
    this.timeout(6000);
    var debuglet = new Debuglet(
      config, logger.create(config.logLevel, '@google/cloud-debug'));

    process.env.GCLOUD_PROJECT_NUM=0;

    var bp = {
      id: 'test',
      location: { path: 'fixtures/foo.js', line: 2 }
    };

    var API = 'https://clouddebugger.googleapis.com';

    var scope = nock(API)
      .post('/v2/controller/debuggees/register')
      .reply(200, {
        debuggee: {
          id: 'bar'
        }
      })
      .get('/v2/controller/debuggees/bar/breakpoints')
      .reply(200, {
        breakpoints: [bp]
      })
      .put('/v2/controller/debuggees/bar/breakpoints/test', function(body) {
        return body.breakpoint.status.description.format === 'The snapshot has expired';
      })
      .reply(200);

    debuglet.once('started', function() {
      debuglet.debugletApi_.request_ = request; // Avoid authing.
    });
    debuglet.once('registered', function(id) {
      assert(id === 'bar');
      setTimeout(function() {
        assert.deepEqual(debuglet.activeBreakpointMap_.test, bp);
        setTimeout(function() {
          assert(!debuglet.activeBreakpointMap_.test);
          debuglet.stop();
          scope.done();
          config.breakpointExpirationSec = oldTimeout;
          done();
        }, 1100);
      }, 500);
    });

    debuglet.start();
  });
});

