"use strict";
var soajs = require('soajs');
var Grid = require('gridfs-stream');
var Mongo = soajs.mongo;
var mongo = null;
var gfs = null;
var gfsdb = null;

function checkForMongo(soajs) {
	if (!mongo) {
		mongo = new Mongo(soajs.registry.coreDB.provision);
	}
}

var hostsColl = "hosts";
var dockerColl = "docker";
var envColl = "environment";
var servicesColl = "services";
var daemonsColl = "daemons";
var gitColl = "git_accounts";
var staticColl = "staticContent";

var model = {
	"getDB": function () {
		return mongo;
	},

	"makeObjectId": function (id) {
		return mongo.ObjectId(id);
	},

	"getEnvironment": function (soajs, code, cb) {
		checkForMongo(soajs);
		mongo.findOne(envColl, {code: code.toUpperCase()}, cb);
	},

	"getDashboardEnvironment": function (soajs, cb) {
		checkForMongo(soajs);
		mongo.findOne(envColl, {code: "DASHBOARD"}, cb);
	},

	/**
	 * DOCKER COLLECTION
	 */
	"countContainers": function (soajs, env, type, cb) {
		var condition = {
			"env": env.toLowerCase(),
			"type": type
		};

		checkForMongo(soajs);
		mongo.count(dockerColl, condition, cb);
	},

	"getContainers": function (soajs, env, type, running, cb) {
		var condition = {
			"env": env.toLowerCase()
		};
		if (type) {
			condition["$or"] = [
				{"type": type},
				{"type": type + "_" + env.toLowerCase()}
			];
		}
		if (running) {
			condition.running = running;
		}
		checkForMongo(soajs);
		mongo.find(dockerColl, condition, cb);
	},

	"getOneContainer": function (soajs, env, hostname, cb) {
		var condition = {
			"env": env.toLowerCase(),
			"$or": [
				{"hostname": hostname},
				{"hostname": hostname + "_" + env.toLowerCase()},
				{"cid": hostname}
			]
		};
		checkForMongo(soajs);
		mongo.findOne(dockerColl, condition, cb);
	},

	"removeContainer": function (soajs, env, hostname, cb) {
		var condition = {
			"env": env.toLowerCase(),
			'$or': [
				{"hostname": hostname + "_" + env.toLowerCase()},
				{"hostname": hostname},
				{"cid": hostname}
			]
		};
		checkForMongo(soajs);
		mongo.remove(dockerColl, condition, cb);
	},

	"insertContainer": function (soajs, record, cb) {
		checkForMongo(soajs);
		record.hostname = record.hostname.replace("/", "");
		mongo.insert(dockerColl, record, cb);
	},

	"updateContainer": function (soajs, containerId, data, cb) {
		checkForMongo(soajs);
		mongo.update(dockerColl, {"cid": containerId}, {'$set': {"info": data}}, {
			multi: false,
			upsert: false,
			safe: true
		}, cb);
	},

	/**
	 * HOSTS COLLECTION
	 */
	"getHosts": function (soajs, env, type, cb) {
		var condition = {
			"env": env.toLowerCase()
		};

		if (type && type !== '') {
			condition["name"] = type;
		}
		checkForMongo(soajs);
		mongo.find(hostsColl, condition, cb);
	},

	"getOneHost": function (soajs, env, type, ip, hostname, cb) {
		var condition = {
			"env": env.toLowerCase(),
			"name": type
		};

		if (ip && ip !== '') {
			condition["ip"] = ip;
		}

		if (hostname && hostname !== '') {
			condition["hostname"] = hostname;
		}
		checkForMongo(soajs);
		mongo.findOne(hostsColl, condition, cb);
	},

	"removeHost": function (soajs, env, type, ip, cb) {
		var condition = {
			"env": env.toLowerCase()
		};

		if (type && type !== '') {
			condition["name"] = type;
		}

		if (ip && ip !== '') {
			condition["ip"] = ip;
		}
		checkForMongo(soajs);
		mongo.remove(hostsColl, condition, cb);
	},

	"insertHost": function (soajs, record, cb) {
		checkForMongo(soajs);
		record.hostname = record.hostname.replace("/", "");
		mongo.insert(hostsColl, record, cb);
	},

	"getService": function (soajs, condition, cb) {
		checkForMongo(soajs);
		mongo.findOne(servicesColl, condition, cb);
	},

	"getDaemon": function (soajs, condition, cb) {
		checkForMongo(soajs);
		mongo.findOne(daemonsColl, condition, cb);
	},

	"getGitAccounts": function (soajs, repoName, cb) {
		checkForMongo(soajs);
		mongo.findOne(gitColl, {"repos.name": repoName}, {provider: 1, token: 1, 'repos.$': 1}, cb);
	},

	"getStaticContent": function (soajs, id, cb) {
		checkForMongo(soajs);
		mongo.findOne(staticColl, {'_id': id}, cb);
	},

	/*
		grid fs
	 */
	// "getGFS": function(soajs, cb){
	// 	if(gfs){
	// 		return cb(null);
	// 	}
	//
	// 	checkForMongo(soajs);
	// 	mongo.getMongoSkinDB(function (error, db) {
	// 		if(error){
	// 			return cb(error);
	// 		}
	//
	// 		gfs = Grid(db, mongo.mongoSkin);
	// 		gfsdb = db;
	// 		return cb(null);
	// 	});
	// },
	//
	// "getFiles": function(soajs, criteria, cb){
	// 	checkForMongo(soajs);
	// 	mongo.find("fs.files", criteria, cb);
	// },
	//
	// "getOneFile": function(soajs, id, cb){
	// 	checkForMongo(soajs);
	// 	model.getGFS(soajs, function(error){
	// 		if(error){
	// 			return cb(error);
	// 		}
	//
	// 		var gs = new gfs.mongo.GridStore(gfsdb, id, 'r', {
	// 			root: 'fs',
	// 			w: 1,
	// 			fsync: true
	// 		});
	//
	// 		gs.open(function (error, gstore) {
	// 			if(error){
	// 				return cb(error);
	// 			}
	//
	// 			gstore.read(function (error, filedata) {
	// 				if(error){
	// 					return cb(error);
	// 				}
	//
	// 				gstore.close();
	// 				return cb(null, filedata);
	// 			});
	// 		});
	// 	});
	// }
};

module.exports = model;
