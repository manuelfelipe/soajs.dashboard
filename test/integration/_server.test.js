"use strict";
var assert = require('assert');
var shell = require('shelljs');
var helper = require("../helper.js");
var sampleData = require("soajs.mongodb.data/modules/dashboard");
var dashboard, controller;

describe("importing sample data", function () {

    it("do import", function (done) {
        shell.pushd(sampleData.dir);
        shell.exec("chmod +x " + sampleData.shell, function (code) {
            assert.equal(code, 0);
            shell.exec(sampleData.shell, function (code) {
                assert.equal(code, 0);
                shell.popd();
                done();
            });
        });
    });

    after(function (done) {
        console.log('test data imported.');
        controller = require("soajs.controller");
        setTimeout(function () {
            dashboard = helper.requireModule('./service/index');
            setTimeout(function () {
                require("./soajs.dashboard.test.js");
                require("./soajs.dashboard.locked.test.js");
                done();
            }, 1000);
        }, 1000);
    });
});